/**
 * 사무실(OFFICE_LAT/LNG) 기준 도보 N분 이내 음식점을 카카오 카테고리 검색으로
 * 빠짐없이 수집해 public/data/lunch-spots.json 을 갱신한다.
 *
 *  - 기존에 있던 식당: active=true 로 유지 + 수동 입력값(가격/메뉴/태그/메모) 보존
 *  - 새로 수집된 주변 식당: active=false (가챠 풀 제외, UI에서 활성화 가능)
 *  - 인자로 받은 카카오 place URL/ID: 신규면 active=false 로 추가
 *
 * 사용: node scripts/import-lunch-nearby.mjs [place_url_or_id ...]
 *   .env.local 에 KAKAO_REST_KEY, OFFICE_LAT, OFFICE_LNG 필요
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(root, 'public', 'data', 'lunch-spots.json');

const LUNCH_CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '카페', '기타'];
const WALK_LIMIT_MIN = parseInt(process.env.LUNCH_WALK_LIMIT || '10', 10); // 도보 분 한도

// ── 현실적인 도보 시간 모델 ──
// 직선거리(haversine)만으로는 실제 걷는 시간이 과소평가된다.
//  - 실보행 속도: 약 4km/h = 67 m/min (기존 75는 빠른 편)
//  - 도로 우회 보정(circuity): 직선 → 실제 경로는 보통 1.3~1.5배
//  - 고정 시간: 사무실(15층) 엘리베이터·로비·횡단보도 등 출입 오버헤드
const WALK_SPEED_M_PER_MIN = parseFloat(process.env.LUNCH_WALK_SPEED || '67');
const WALK_DETOUR = parseFloat(process.env.LUNCH_WALK_DETOUR || '1.4');
const WALK_BASE_MIN = parseFloat(process.env.LUNCH_WALK_BASE || '2');
// 수집 반경 산정용 속도(기존과 동일하게 두어 수집되는 식당 범위는 유지)
const COLLECT_SPEED_M_PER_MIN = 75;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const KAKAO_KEY = process.env.KAKAO_REST_KEY || process.env.KAKAO_REST_API_KEY || '';
const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT || '');
const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG || '');
const OFFICE_LABEL = process.env.OFFICE_LABEL || '사무실 주변';

if (!KAKAO_KEY) {
  console.error('KAKAO_REST_KEY 가 없습니다. docs/맛집-등록-가이드.md 참고');
  process.exit(1);
}
if (!Number.isFinite(OFFICE_LAT) || !Number.isFinite(OFFICE_LNG)) {
  console.error('OFFICE_LAT / OFFICE_LNG 가 필요합니다.');
  process.exit(1);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function walkMinutesFromMeters(m) {
  const meters = Math.max(0, Number(m) || 0);
  const minutes = WALK_BASE_MIN + (meters * WALK_DETOUR) / WALK_SPEED_M_PER_MIN;
  return Math.max(1, Math.round(minutes));
}

function mapCategory(categoryName) {
  const c = categoryName || '';
  if (c.includes('한식') || c.includes('국밥') || c.includes('백반') || c.includes('찌개')) return '한식';
  if (c.includes('중식') || c.includes('중국')) return '중식';
  if (c.includes('일식') || c.includes('일본') || c.includes('돈까스') || c.includes('초밥')) return '일식';
  if (c.includes('양식') || c.includes('이탈') || c.includes('패스트푸드') || c.includes('햄버거') || c.includes('피자')) return '양식';
  if (c.includes('분식') || c.includes('김밥') || c.includes('떡볶이')) return '분식';
  if (c.includes('카페') || c.includes('커피') || c.includes('베이커리')) return '카페';
  return '기타';
}

function tagsFromCategory(categoryName) {
  const parts = (categoryName || '').split('>').map(s => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2) : parts;
}

function naverMapSearchUrl(placeName, address) {
  const q = [placeName, address].filter(Boolean).join(' ');
  return `https://map.naver.com/v5/search/${encodeURIComponent(q)}`;
}

function placeIdFromUrl(url) {
  const m = String(url || '').match(/place\.map\.kakao\.com\/(\d+)/);
  return m ? m[1] : '';
}

function normName(s) {
  return String(s || '').replace(/\s/g, '');
}

async function kakaoCategory(x, y, radius, page) {
  const params = new URLSearchParams({
    category_group_code: 'FD6',
    x: String(x),
    y: String(y),
    radius: String(radius),
    sort: 'distance',
    page: String(page),
    size: '15',
  });
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/category.json?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  if (!res.ok) throw new Error(`카카오 카테고리 API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function kakaoKeyword(query) {
  const params = new URLSearchParams({ query, size: '5' });
  params.set('x', String(OFFICE_LNG));
  params.set('y', String(OFFICE_LAT));
  params.set('radius', '20000');
  params.set('sort', 'distance');
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  if (!res.ok) throw new Error(`카카오 키워드 API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.documents ?? [];
}

async function fetchPlaceMeta(placeId) {
  const res = await fetch(`https://place.map.kakao.com/${placeId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`장소 페이지 ${res.status}`);
  const html = await res.text();
  return {
    title: html.match(/property="og:title" content="([^"]+)"/)?.[1]?.trim() || '',
    address: html.match(/property="og:description" content="([^"]+)"/)?.[1]?.trim() || '',
  };
}

/** 사무실 주변을 격자로 나눠 카테고리 검색(45건 캡 회피), place id 기준 dedupe */
async function collectNearbyDocs() {
  const limitMeters = WALK_LIMIT_MIN * COLLECT_SPEED_M_PER_MIN; // 10분 ≈ 750m (수집 반경)
  const span = Math.ceil(limitMeters) + 100; // 약간 여유
  const step = 300; // 격자 간격(m)
  const cellRadius = 280; // 셀 검색 반경(m), 인접 셀과 겹치게
  const mPerDegLat = 111000;
  const mPerDegLng = 111000 * Math.cos((OFFICE_LAT * Math.PI) / 180);

  const offsets = [];
  for (let dx = -span; dx <= span; dx += step) {
    for (let dy = -span; dy <= span; dy += step) {
      offsets.push([dx, dy]);
    }
  }

  const byId = new Map();
  let calls = 0;
  for (const [dx, dy] of offsets) {
    const cx = OFFICE_LNG + dx / mPerDegLng;
    const cy = OFFICE_LAT + dy / mPerDegLat;
    for (let page = 1; page <= 3; page++) {
      let data;
      try {
        data = await kakaoCategory(cx, cy, cellRadius, page);
      } catch (e) {
        console.warn('  검색 실패:', e.message);
        break;
      }
      calls++;
      for (const doc of data.documents ?? []) {
        if (!byId.has(doc.id)) byId.set(doc.id, doc);
      }
      await new Promise(r => setTimeout(r, 60));
      if (data.meta?.is_end) break;
    }
  }
  console.log(`  격자 ${offsets.length}칸 · API ${calls}회 · 원시 후보 ${byId.size}곳`);
  return [...byId.values()];
}

function docToSpot(doc, active) {
  const address = doc.road_address_name || doc.address_name || '';
  const lat = parseFloat(doc.y);
  const lng = parseFloat(doc.x);
  const meters = haversineMeters(OFFICE_LAT, OFFICE_LNG, lat, lng);
  const category = mapCategory(doc.category_name);
  return {
    name: doc.place_name,
    category: LUNCH_CATEGORIES.includes(category) ? category : '기타',
    tags: tagsFromCategory(doc.category_name),
    priceRange: '미입력',
    walkMinutes: walkMinutesFromMeters(meters),
    naverMapUrl: naverMapSearchUrl(doc.place_name, address),
    kakaoMapUrl: (doc.place_url || `https://place.map.kakao.com/${doc.id}`).replace(/^http:/, 'https:'),
    menuHints: [],
    notes: address ? `주소: ${address}` : undefined,
    active,
    _placeId: String(doc.id),
    _meters: meters,
  };
}

function readExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) return { spots: [] };
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch {
    return { spots: [] };
  }
}

function makeId(existingIds, name) {
  const slug = String(name).replace(/[^\w\uAC00-\uD7A3]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  let n = existingIds.size + 1;
  let id;
  do {
    id = `spot-${String(n).padStart(3, '0')}${slug ? `-${slug}` : ''}`;
    n++;
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

async function main() {
  const existingDb = readExisting();
  const existingSpots = Array.isArray(existingDb.spots) ? existingDb.spots : [];

  // 기존 식당 인덱스 (place id / 이름)
  const existingByPid = new Map();
  const existingByName = new Map();
  for (const s of existingSpots) {
    const pid = placeIdFromUrl(s.kakaoMapUrl);
    if (pid) existingByPid.set(pid, s);
    existingByName.set(normName(s.name), s);
  }

  // 1) 주변 식당 수집
  console.log(`사무실: ${OFFICE_LABEL} · 도보 ${WALK_LIMIT_MIN}분 이내 음식점 수집…`);
  const rawDocs = await collectNearbyDocs();
  const collectRadiusM = WALK_LIMIT_MIN * COLLECT_SPEED_M_PER_MIN; // 표시 분과 무관하게 물리 반경으로 필터
  const nearbySpots = rawDocs
    .map(d => docToSpot(d, false))
    .filter(s => s._meters <= collectRadiusM);
  console.log(`  반경 ${Math.round(collectRadiusM)}m 이내 ${nearbySpots.length}곳`);

  // 기존 식당 walkMinutes 재계산용: 수집 문서의 좌표/거리 인덱스
  const metersByPid = new Map();
  const metersByName = new Map();
  for (const d of rawDocs) {
    const lat = parseFloat(d.y);
    const lng = parseFloat(d.x);
    const meters = haversineMeters(OFFICE_LAT, OFFICE_LNG, lat, lng);
    metersByPid.set(String(d.id), meters);
    const nm = normName(d.place_name);
    if (!metersByName.has(nm)) metersByName.set(nm, meters);
  }

  // 2) 인자로 받은 카카오 place 추가 (퇴근길숯불막창 등)
  const placeArgs = process.argv.slice(2).map(placeIdFromUrl).filter(Boolean);
  const explicitSpots = [];
  for (const pid of placeArgs) {
    try {
      const meta = await fetchPlaceMeta(pid);
      const docs = meta.title ? await kakaoKeyword(meta.title) : [];
      const doc = docs.find(d => String(d.id) === pid) ?? docs[0];
      if (doc) {
        explicitSpots.push(docToSpot(doc, false));
        console.log(`  지정 추가: ${doc.place_name}`);
      } else if (meta.title) {
        explicitSpots.push({
          name: meta.title,
          category: '기타',
          tags: [],
          priceRange: '미입력',
          walkMinutes: 0,
          naverMapUrl: naverMapSearchUrl(meta.title, meta.address),
          kakaoMapUrl: `https://place.map.kakao.com/${pid}`,
          menuHints: [],
          notes: meta.address ? `주소: ${meta.address}` : undefined,
          active: false,
          _placeId: pid,
          _meters: 0,
        });
        console.log(`  지정 추가(메타): ${meta.title}`);
      }
    } catch (e) {
      console.warn(`  지정 추가 실패 ${pid}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 120));
  }

  // 3) 병합: 기존 우선 유지(active=true), 신규는 active=false
  const result = [];
  const usedIds = new Set(existingSpots.map(s => s.id));
  const seenPid = new Set();
  const seenName = new Set();

  // 3-1) 기존 식당은 활성화 유지 + 좌표 매칭되면 walkMinutes 재계산(수동 필드는 보존)
  let recomputed = 0;
  for (const s of existingSpots) {
    const { active, ...rest } = s;
    void active;
    const pid = placeIdFromUrl(s.kakaoMapUrl);
    const meters = (pid && metersByPid.get(pid)) ?? metersByName.get(normName(s.name));
    let walkMinutes = rest.walkMinutes;
    if (Number.isFinite(meters)) {
      walkMinutes = walkMinutesFromMeters(meters);
      recomputed++;
    } else if (!Number.isFinite(walkMinutes) || walkMinutes <= 0) {
      walkMinutes = WALK_BASE_MIN; // 좌표 못 찾고 기존값도 0 이면 최소 출입시간
    }
    result.push({ ...rest, walkMinutes, active: true });
    if (pid) seenPid.add(pid);
    seenName.add(normName(s.name));
  }
  console.log(`  기존 ${existingSpots.length}곳 중 ${recomputed}곳 도보시간 재계산`);

  // 3-2) 신규 후보(지정 + 주변) 추가 — 기존과 중복 제외
  const candidates = [...explicitSpots, ...nearbySpots];
  for (const c of candidates) {
    const pid = c._placeId;
    const nm = normName(c.name);
    if ((pid && seenPid.has(pid)) || seenName.has(nm)) continue; // 이미 존재 → skip(기존 active 유지)
    seenPid.add(pid);
    seenName.add(nm);
    const { _placeId, _meters, ...rest } = c;
    void _placeId; void _meters;
    result.push({ ...rest, id: makeId(usedIds, c.name), active: false });
  }

  // 정렬: 활성 먼저, 그다음 도보 가까운 순
  result.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.walkMinutes - b.walkMinutes || a.name.localeCompare(b.name, 'ko');
  });

  const db = {
    updatedAt: new Date().toISOString().slice(0, 10),
    officeLabel: OFFICE_LABEL,
    spots: result,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(db, null, 2), 'utf-8');

  const activeCount = result.filter(s => s.active).length;
  console.log(`\n완료: ${OUTPUT_PATH}`);
  console.log(`  총 ${result.length}곳 (활성 ${activeCount} / 비활성 ${result.length - activeCount})`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
