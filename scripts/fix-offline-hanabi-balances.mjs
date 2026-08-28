/**
 * 오프라인·하나비 — 시드 JSON으로 잔액·엑셀 공문 복구 (로컬/배포 동일)
 * Usage: node scripts/fix-offline-hanabi-balances.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const seed = JSON.parse(
  fs.readFileSync(path.join(root, 'data', 'arrears-inactive-seed.json'), 'utf8'),
);

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

for (const t of seed.entries) {
  console.log(`\n=== ${t.companyName} (${t.externalCode}) lines=${t.lines.length} ===`);

  const [entry] = await sql`
    SELECT id, company_name, balance FROM arrears_entries
    WHERE external_code = ${t.externalCode} OR company_name = ${t.companyName}
    LIMIT 1
  `;
  if (!entry) {
    console.error('DB 없음:', t.companyName);
    continue;
  }

  await sql`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${entry.id}`;
  for (let i = 0; i < t.lines.length; i++) {
    const l = t.lines[i];
    await sql`
      INSERT INTO arrears_letter_lines (
        arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
      ) VALUES (
        ${entry.id}, ${i}, ${l.description}, ${l.amount}, ${l.paidAmount}, ${l.paidDate}, 'letter'
      )
    `;
  }
  const asOf = t.letterDate.replace(/\./g, '-');
  await sql`
    UPDATE arrears_entries SET
      balance = ${t.balance},
      carry_in = ${t.balance},
      debit = 0,
      credit = 0,
      letter_date = ${t.letterDate},
      as_of_date = ${asOf},
      source = 'letter',
      updated_by = 'fix-offline-hanabi-balances',
      updated_at = now()
    WHERE id = ${entry.id}
  `;
  console.log(`OK ${t.companyName}: balance=${t.balance} lines=${t.lines.length}`);
}

await sql.end({ timeout: 5 });
