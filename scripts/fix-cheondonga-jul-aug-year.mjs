/**
 * 천돈가(윤삼식) 01418: 원장 7·8월 기장료·기타수수료 연도 2026 → 2025
 * (9/21 원장 줄 추가 때 기준일 연도가 붙음. 2024.9~2025.6 연속 청구의 다음 달)
 * LIVE 공문 줄 + data/arrears-frozen-letter-lines.json 스냅샷 (+ --neon 이면 Neon 백업도)
 *
 * node scripts/fix-cheondonga-jul-aug-year.mjs [--apply] [--neon]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const NEON = process.argv.includes('--neon');
const CODE = '01418';
const RENAME = {
  '2026년 7월 기장료': '2025년 7월 기장료',
  '2026년 7월 기타수수료': '2025년 7월 기타수수료',
  '2026년 8월 기장료': '2025년 8월 기장료',
  '2026년 8월 기타수수료': '2025년 8월 기타수수료',
};

function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) o[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}
const env = { ...loadEnv(path.join(root, '.env')), ...loadEnv(path.join(root, '.env.local')) };

async function fixDb(label, url) {
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 60 });
  try {
    const rows = await sql`
      select l.id, l.description from arrears_letter_lines l
      join arrears_entries e on e.id = l.arrears_entry_id
      where e.external_code = ${CODE} and l.description in ${sql(Object.keys(RENAME))}
      order by l.sort_order`;
    console.log(`[${label}] 대상 ${rows.length}줄`);
    for (const r of rows) console.log(`  ${r.description} → ${RENAME[r.description]}`);
    if (rows.length !== 4) throw new Error(`[${label}] 4줄이 아님 — 중단`);
    if (!APPLY) return;
    await sql.begin(async tx => {
      for (const r of rows) {
        await tx`update arrears_letter_lines set description = ${RENAME[r.description]}, updated_at = now() where id = ${r.id}`;
      }
    });
    console.log(`[${label}] 적용 완료`);
  } finally {
    await sql.end();
  }
}

function fixSnapshot() {
  const p = path.join(root, 'data/arrears-frozen-letter-lines.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const lines = j.codes?.[CODE]?.lines;
  if (!lines) throw new Error('snapshot 01418 없음');
  let n = 0;
  for (const l of lines) {
    if (RENAME[l.description]) {
      l.description = RENAME[l.description];
      n++;
    }
  }
  console.log(`[snapshot] 대상 ${n}줄`);
  if (n !== 4) throw new Error('snapshot 4줄이 아님 — 중단');
  if (APPLY) {
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
    console.log('[snapshot] 저장 완료');
  }
}

console.log(APPLY ? 'APPLY' : 'DRY-RUN');
await fixDb('LIVE', env.DATABASE_URL);
if (NEON) await fixDb('NEON', env.PREV_DATABASE_URL);
fixSnapshot();
