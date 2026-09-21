/**
 * 미수 공문·엔트리만 JSON 스냅샷 (확정본 보관용)
 * node scripts/snapshot-arrears-freeze.mjs [outPath]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, 'Z');
const outArg = process.argv[2];
const outPath = outArg
  ? path.resolve(outArg)
  : path.join(root, 'backups', `arrears-freeze-snapshot-${stamp}.json`);

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 25 });

const entries = await sql`SELECT * FROM arrears_entries ORDER BY external_code`;
const lines = await sql`
  SELECT l.*
  FROM arrears_letter_lines l
  JOIN arrears_entries e ON e.id = l.arrears_entry_id
  ORDER BY e.external_code, l.sort_order, l.created_at
`;
const cfg = await sql`
  SELECT key, value FROM app_config
  WHERE key IN ('arrears_import_config', 'arrears_detail_endings')
`;

const payload = {
  meta: {
    kind: 'arrears-freeze-snapshot',
    note: '저번주(2026-09-15) 조정료 원문 확정본 기준 고정 — Neon 통째 복원 금지',
    cutoff: '2026.08.31',
    createdAt: new Date().toISOString(),
    entryCount: entries.length,
    lineCount: lines.length,
  },
  appConfig: Object.fromEntries(cfg.map(r => [r.key, r.value])),
  entries,
  letterLines: lines,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload));
console.log('wrote', outPath, 'entries', entries.length, 'lines', lines.length);

await sql.end({ timeout: 5 });
