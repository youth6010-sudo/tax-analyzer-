/**
 * 스냅샷 JSON의 arrears_letter_lines 만 LIVE에 복원
 * node scripts/restore-letter-lines-from-snapshot.mjs backups/xxx.json [--apply] [--code=00156]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const onlyCode = (process.argv.find(a => a.startsWith('--code=')) || '').slice(7);
const snapPath = process.argv.find(a => a.endsWith('.json') && !a.includes('='));

if (!snapPath) {
  console.error('usage: node scripts/restore-letter-lines-from-snapshot.mjs backups/xxx.json [--apply]');
  process.exit(1);
}

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

const snap = JSON.parse(fs.readFileSync(path.resolve(snapPath), 'utf8'));
const entries = snap.entries || [];
const lines = snap.letterLines || [];
console.log('snapshot', snapPath, 'entries', entries.length, 'lines', lines.length, snap.meta?.createdAt);

const byEntryId = new Map();
for (const l of lines) {
  const id = l.arrears_entry_id || l.arrearsEntryId;
  if (!byEntryId.has(id)) byEntryId.set(id, []);
  byEntryId.get(id).push(l);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 25 });
let restored = 0;

for (const e of entries) {
  const code = String(e.external_code || e.externalCode || '').padStart(5, '0');
  if (onlyCode && code !== onlyCode.padStart(5, '0')) continue;
  const snapId = e.id;
  const [live] = await sql`
    SELECT id FROM arrears_entries WHERE external_code = ${code} LIMIT 1
  `;
  if (!live) continue;
  const snapLines = (byEntryId.get(snapId) || []).slice().sort(
    (a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0),
  );

  if (!APPLY) {
    if (restored < 5 || code === '00156') {
      console.log('would restore', code, 'lines', snapLines.length);
    }
    restored += 1;
    continue;
  }

  await sql.begin(async tx => {
    await tx`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${live.id}`;
    let order = 0;
    for (const l of snapLines) {
      await tx`
        INSERT INTO arrears_letter_lines (
          arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
        ) VALUES (
          ${live.id},
          ${order},
          ${l.description ?? ''},
          ${Math.round(Number(l.amount) || 0)},
          ${Math.round(Number(l.paid_amount ?? l.paidAmount) || 0)},
          ${l.paid_date ?? l.paidDate ?? ''},
          ${l.source || 'letter'}
        )
      `;
      order += 1;
    }
  });
  restored += 1;
  if (code === '00156' || restored % 50 === 0) {
    console.log('restored', code, snapLines.length);
  }
}

console.log(APPLY ? 'APPLY' : 'DRY', 'restored', restored);
await sql.end({ timeout: 5 });
