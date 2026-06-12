/**
 * 점심 맛집 목록 → public/data/lunch-spots.json 자동 생성 (카카오 Local API)
 *
 * 사용:
 *   1) .env.local 에 KAKAO_REST_KEY, OFFICE_LAT, OFFICE_LNG 설정
 *   2) data/lunch-list.txt 에 가게명 작성 (한 줄에 하나)
 *   3) npm run import:lunch
 *
 * 입력 형식 (data/lunch-list.txt):
 *   ○○국밥
 *   △△짬뽕|역삼동 123
 *   https://place.map.kakao.com/27233884
 *   # 으로 시작하는 줄은 주석
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const INPUT_PATH = process.argv[2] || path.join(root, 'data', 'lunch-list.txt');
const OUTPUT_PATH = path.join(root, 'public', 'data', 'lunch-spots.json');

const LUNCH_CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '카페', '기타'];

// ── .env.local / .env 로드 ──────────────────────────────────────
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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
const SEARCH_RADIUS = parseInt(process.env.LUNCH_SEARCH_RADIUS || '2000', 10);

// ── 카카오 API ────────────────────────────────────────────────────
async function kakaoKeywordSearch(query) {
  const params = new URLSearchParams({ query, size: '5' });
  if (Number.isFinite(OFFICE_LAT) && Number.isFinite(OFFICE_LNG)) {
    params.set('x', String(OFFICE_LNG));
    params.set('y', String(OFFICE_LAT));
    params.set('radius', String(SEARCH_RADIUS));
    params.set('sort', 'distance');
  }

  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`카카오 API ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.documents ?? [];
}

function mapCategory(categoryName) {
  const c = categoryName || '';
  if (c.includes('한식') || c.includes('국밥') || c.includes('백반') || c.includes('찌개')) return '한식';
  if (c.includes('중식') || c.includes('중국')) return '중식';
  if (c.includes('일식') || c.includes('일본') || c.includes('돈까스') || c.includes('초밥')) return '일식';
  if (c.includes('양식') || c.includes('이탈') || c.includes('패스트푸드') || c.includes('햄버거')) return '양식';
  if (c.includes('분식') || c.includes('김밥') || c.includes('떡볶이')) return '분식';
  if (c.includes('카페') || c.includes('커피') || c.includes('베이커리')) return '카페';
  return '기타';
}

function tagsFromCategory(categoryName) {
  const parts = (categoryName || '')
    .split('>')
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2) : parts;
}

function walkMinutesFromDistance(meters) {
  if (!meters || meters <= 0) return 0;
  const speedMPerMin = 4500 / 60;
  return Math.max(1, Math.round(meters / speedMPerMin));
}

function naverMapSearchUrl(placeName, address) {
  const q = [placeName, address].filter(Boolean).join(' ');
  return `https://map.naver.com/v5/search/${encodeURIComponent(q)}`;
}

function slugId(index, placeName) {
  const slug = placeName
    .replace(/[^\w\uAC00-\uD7A3]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return `spot-${String(index + 1).padStart(3, '0')}${slug ? `-${slug}` : ''}`;
}

function parseInputEntries(text) {
  const entries = [];
  const seenPlaceIds = new Set();

  const urlRe = /place\.map\.kakao\.com\/(\d+)/g;
  let match;
  while ((match = urlRe.exec(text)) !== null) {
    const placeId = match[1];
    if (!seenPlaceIds.has(placeId)) {
      seenPlaceIds.add(placeId);
      entries.push({ kind: 'place', placeId });
    }
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/place\.map\.kakao\.com\/\d+/.test(trimmed)) continue;

    const pipe = trimmed.indexOf('|');
    if (pipe >= 0) {
      entries.push({
        kind: 'name',
        name: trimmed.slice(0, pipe).trim(),
        hint: trimmed.slice(pipe + 1).trim(),
      });
    } else {
      entries.push({ kind: 'name', name: trimmed, hint: '' });
    }
  }

  return entries;
}

async function fetchPlaceMeta(placeId) {
  const res = await fetch(`https://place.map.kakao.com/${placeId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`장소 페이지 ${res.status}`);
  const html = await res.text();
  return {
    placeId,
    title: html.match(/property="og:title" content="([^"]+)"/)?.[1]?.trim() || '',
    address: html.match(/property="og:description" content="([^"]+)"/)?.[1]?.trim() || '',
  };
}

function spotFromDoc(index, doc, kakaoMapUrl) {
  const address = doc.road_address_name || doc.address_name || '';
  const category = mapCategory(doc.category_name);
  return {
    id: slugId(index, doc.place_name),
    name: doc.place_name,
    category: LUNCH_CATEGORIES.includes(category) ? category : '기타',
    tags: tagsFromCategory(doc.category_name),
    priceRange: '미입력',
    walkMinutes: walkMinutesFromDistance(parseInt(doc.distance || '0', 10)),
    naverMapUrl: naverMapSearchUrl(doc.place_name, address),
    kakaoMapUrl,
    menuHints: [],
    notes: address ? `주소: ${address}` : undefined,
  };
}

function readExistingSpots() {
  if (!fs.existsSync(OUTPUT_PATH)) return [];
  try {
    const db = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    return Array.isArray(db.spots) ? db.spots : [];
  } catch {
    return [];
  }
}

function findExisting(existing, placeName) {
  return existing.find(s => s.name === placeName || s.name.replace(/\s/g, '') === placeName.replace(/\s/g, ''));
}

function mergeSpot(existing, generated) {
  if (!existing) return generated;
  return {
    ...generated,
    tags: existing.tags?.length ? existing.tags : generated.tags,
    priceRange:
      existing.priceRange && existing.priceRange !== '미입력' && existing.priceRange !== ''
        ? existing.priceRange
        : generated.priceRange,
    menuHints: existing.menuHints?.length ? existing.menuHints : generated.menuHints,
    notes: existing.notes ?? generated.notes,
    walkMinutes: existing.walkMinutes > 0 && generated.walkMinutes === 0 ? existing.walkMinutes : generated.walkMinutes,
  };
}

async function buildSpotFromName(index, { name, hint }, existingList) {
  const query = hint ? `${name} ${hint}` : name;
  console.log(`  검색: ${query}`);

  const docs = await kakaoKeywordSearch(query);
  if (docs.length === 0) {
    console.warn(`  ⚠ 결과 없음 — 수동 등록 필요: ${name}`);
    const fallback = {
      id: slugId(index, name),
      name,
      category: '기타',
      tags: [],
      priceRange: '미입력',
      walkMinutes: 0,
      naverMapUrl: naverMapSearchUrl(name, hint),
      kakaoMapUrl: `https://map.kakao.com/?q=${encodeURIComponent(query)}`,
      menuHints: [],
      notes: hint ? `검색 힌트: ${hint} (API 결과 없음 — 정보를 직접 입력하세요)` : 'API 결과 없음 — 정보를 직접 입력하세요',
    };
    return mergeSpot(findExisting(existingList, name), fallback);
  }

  const doc = docs[0];
  const address = doc.road_address_name || doc.address_name || '';
  const kakaoMapUrl =
    doc.place_url?.replace(/^http:/, 'https:') || `https://place.map.kakao.com/${doc.id}`;
  const generated = spotFromDoc(index, doc, kakaoMapUrl);

  if (docs.length > 1) {
    console.log(`  → ${doc.place_name} (${address || '주소 없음'}) [${doc.category_name}]`);
    console.log(`    (${docs.length}건 중 1번째 — 다른 가게면 "이름|주소" 형식으로 구체화하세요)`);
  } else {
    console.log(`  → ${doc.place_name} (${address || '주소 없음'})`);
  }

  return mergeSpot(findExisting(existingList, name), generated);
}

async function buildSpotFromPlace(index, { placeId }, existingList) {
  const kakaoMapUrl = `https://place.map.kakao.com/${placeId}`;
  console.log(`  카카오 장소: ${kakaoMapUrl}`);

  const meta = await fetchPlaceMeta(placeId);
  if (!meta.title) throw new Error('장소 이름을 가져오지 못했습니다');

  const docs = await kakaoKeywordSearch(meta.title);
  const doc = docs.find(d => String(d.id) === String(placeId)) ?? docs[0];

  if (!doc) {
    console.warn(`  ⚠ API 결과 없음 — 메타 정보만 사용: ${meta.title}`);
    const fallback = {
      id: slugId(index, meta.title),
      name: meta.title,
      category: '기타',
      tags: [],
      priceRange: '미입력',
      walkMinutes: 0,
      naverMapUrl: naverMapSearchUrl(meta.title, meta.address),
      kakaoMapUrl,
      menuHints: [],
      notes: meta.address ? `주소: ${meta.address}` : undefined,
    };
    return mergeSpot(findExisting(existingList, meta.title), fallback);
  }

  const generated = spotFromDoc(index, doc, kakaoMapUrl);
  const address = doc.road_address_name || doc.address_name || meta.address;
  console.log(`  → ${doc.place_name} (${address || '주소 없음'})`);

  return mergeSpot(findExisting(existingList, meta.title), generated);
}

async function main() {
  if (!KAKAO_KEY) {
    console.error(`
KAKAO_REST_KEY 가 없습니다.

1. https://developers.kakao.com 에서 앱 만들기
2. [앱] → [앱 키] → REST API 키 복사
3. [앱] → [플랫폼] → Web 사이트 도메인 등록 (http://localhost 등)
4. [앱] → [카카오맵] → 활성화
5. 프로젝트 루트 .env.local 파일:

   KAKAO_REST_KEY=여기에_REST_API_키
   OFFICE_LAT=37.5012
   OFFICE_LNG=127.0396
   OFFICE_LABEL=우리 사무실

자세한 방법: docs/맛집-등록-가이드.md
`);
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_PATH)) {
    console.error('입력 파일이 없습니다:', INPUT_PATH);
    console.error('예: data/lunch-list.example.txt 를 data/lunch-list.txt 로 복사 후 가게명을 적으세요.');
    process.exit(1);
  }

  const entries = parseInputEntries(fs.readFileSync(INPUT_PATH, 'utf-8'));
  if (entries.length === 0) {
    console.error('입력 파일에 가게명 또는 카카오 장소 URL이 없습니다:', INPUT_PATH);
    process.exit(1);
  }

  const existingList = readExistingSpots();
  console.log(`맛집 ${entries.length}곳 처리 중… (사무실: ${OFFICE_LABEL})`);
  if (!Number.isFinite(OFFICE_LAT)) {
    console.warn('⚠ OFFICE_LAT/LNG 미설정 — 도보 시간·거리순 정렬 없이 검색합니다.');
  }

  const spots = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      const entry = entries[i];
      if (entry.kind === 'place') {
        spots.push(await buildSpotFromPlace(i, entry, existingList));
      } else {
        spots.push(await buildSpotFromName(i, entry, existingList));
      }
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      const label = entries[i].kind === 'place' ? entries[i].placeId : entries[i].name;
      console.error(`  ✗ ${label}:`, e.message);
    }
  }

  const db = {
    updatedAt: new Date().toISOString().slice(0, 10),
    officeLabel: OFFICE_LABEL,
    spots,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(db, null, 2), 'utf-8');
  console.log(`\n완료: ${OUTPUT_PATH} (${spots.length}곳)`);
  console.log('priceRange, menuHints, tags, notes 는 JSON에서 직접 보완하거나 다시 import 하면 기존 값이 유지됩니다.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
