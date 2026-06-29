/**
 * 기존 public/data/lunch-spots.json 의 walkMinutes 를 "현실적인 도보 시간"으로 재계산한다.
 *  - 좌표는 카카오 키워드 검색으로 place id(또는 동일 이름) 매칭하여 가져온다.
 *  - active / id / 수동 입력값(가격·메뉴·태그·메모)은 그대로 보존한다.
 *
 * 왜 필요한가: 기존 계산은 직선거리 ÷ 75m/분 이라 실제보다 짧게 나왔고,
 *  curated(active) 식당 일부는 walkMinutes=0 이었다. import-lunch-nearby.mjs 를
 *  재실행하면 모든 식당이 active=true 로 바뀌므로(대량 오염) 이 스크립트로만 보정한다.
 *
 * 사용: node scripts/recompute-lunch-walk.mjs
 *   .env.local 에 KAKAO_REST_KEY, OFFICE_LAT, OFFICE_LNG 필요
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(root, 'public', 'data', 'lunch-spots.json');

// 현실적 도보 모델 (import-lunch-nearby.mjs 와 동일 기준)
const WALK_SPEED_M_PER_MIN = parseFloat(process.env.LUNCH_WALK_SPEED || '67'); // 약 4km/h
const WALK_DETOUR = parseFloat(process.env.LUNCH_WALK_DETOUR || '1.4'); // 도로 우회 보정
const WALK_BASE_MIN = parseFloat(process.env.LUNCH_WALK_BASE || '2'); // 건물 출입(15층 엘베·로비)·횡단

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

if (!KAKAO_KEY) {
  console.error('KAKAO_REST_KEY 가 없습니다.');
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

function placeIdFromUrl(url) {
  const m = String(url || '').match(/place\.map\.kakao\.com\/(\d+)/);
  return m ? m[1] : '';
}

function normName(s) {
  return String(s || '').replace(/\s/g, '');
}

async function kakaoKeyword(query) {
  const params = new URLSearchParams({ query, size: '15' });
  params.set('x', String(OFFICE_LNG));
  params.set('y', String(OFFICE_LAT));
  params.set('radius', '20000');
  params.set('sort', 'distance');
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  if (!res.ok) throw new Error(`키워드 API ${res.status}`);
  const data = await res.json();
  return data.documents ?? [];
}

/** 스팟의 좌표/거리(m)를 카카오에서 찾는다. 못 찾으면 null */
async function metersForSpot(spot) {
  const pid = placeIdFromUrl(spot.kakaoMapUrl);
  let docs;
  try {
    docs = await kakaoKeyword(spot.name);
  } catch (e) {
    console.warn('  검색 실패:', spot.name, e.message);
    return null;
  }
  if (!docs.length) return null;
  const nm = normName(spot.name);
  const doc =
    docs.find(d => String(d.id) === pid) ||
    docs.find(d => normName(d.place_name) === nm) ||
    docs[0];
  if (!doc) return null;
  if (Number.isFinite(Number(doc.distance))) return Number(doc.distance);
  return haversineMeters(OFFICE_LAT, OFFICE_LNG, parseFloat(doc.y), parseFloat(doc.x));
}

async function main() {
  const db = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  const spots = Array.isArray(db.spots) ? db.spots : [];
  console.log(`재계산 대상 ${spots.length}곳 · 도보모델 base ${WALK_BASE_MIN}분 + 거리×${WALK_DETOUR} ÷ ${WALK_SPEED_M_PER_MIN}m/분`);

  let matched = 0;
  let missed = 0;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const meters = await metersForSpot(s);
    if (Number.isFinite(meters)) {
      s.walkMinutes = walkMinutesFromMeters(meters);
      matched++;
    } else {
      if (!Number.isFinite(s.walkMinutes) || s.walkMinutes <= 0) s.walkMinutes = WALK_BASE_MIN;
      missed++;
    }
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${spots.length}`);
    await new Promise(r => setTimeout(r, 80));
  }

  db.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(db, null, 2), 'utf-8');

  const dist = {};
  for (const s of spots) dist[s.walkMinutes] = (dist[s.walkMinutes] || 0) + 1;
  console.log(`\n완료: ${OUTPUT_PATH}`);
  console.log(`  매칭 ${matched} · 미매칭 ${missed}`);
  console.log(`  walkMinutes 분포: ${JSON.stringify(dist)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
