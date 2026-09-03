/**
 * Neon → Supabase: arrears_entries 잔액/차대변/이월만 동기화
 * (letter_lines 등 Supabase가 더 많은 테이블은 건드리지 않음)
 */
import fs from 'node:fs';
import postgres from 'postgres';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const sourceUrl = env.DATABASE_URL;
const destUrl = env.PREV_DATABASE_URL || env.TARGET_DATABASE_URL;
if (!sourceUrl || !/neon\.tech/i.test(sourceUrl)) {
  console.error('SOURCE must be Neon DATABASE_URL');
  process.exit(1);
}
if (!destUrl || !/supabase/i.test(destUrl)) {
  console.error('DEST must be Supabase PREV/TARGET');
  process.exit(1);
}

const src = postgres(sourceUrl, { max: 1, prepare: false, connect_timeout: 20 });
const dst = postgres(destUrl, { max: 1, prepare: false, connect_timeout: 20 });

const cols = await src`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'arrears_entries'
`;
const colSet = new Set(cols.map((c) => c.column_name));
const hasUpdatedAt = colSet.has('updated_at');

const rows = await src`
  SELECT external_code, balance, debit, credit, carry_in, manager_name
  FROM arrears_entries
`;

let updated = 0;
let skipped = 0;
for (const r of rows) {
  const result = hasUpdatedAt
    ? await dst`
        UPDATE arrears_entries SET
          balance = ${r.balance},
          debit = ${r.debit},
          credit = ${r.credit},
          carry_in = ${r.carry_in},
          manager_name = ${r.manager_name},
          updated_at = now()
        WHERE external_code = ${r.external_code}
          AND (
            balance IS DISTINCT FROM ${r.balance}
            OR debit IS DISTINCT FROM ${r.debit}
            OR credit IS DISTINCT FROM ${r.credit}
            OR carry_in IS DISTINCT FROM ${r.carry_in}
            OR manager_name IS DISTINCT FROM ${r.manager_name}
          )
      `
    : await dst`
        UPDATE arrears_entries SET
          balance = ${r.balance},
          debit = ${r.debit},
          credit = ${r.credit},
          carry_in = ${r.carry_in},
          manager_name = ${r.manager_name}
        WHERE external_code = ${r.external_code}
          AND (
            balance IS DISTINCT FROM ${r.balance}
            OR debit IS DISTINCT FROM ${r.debit}
            OR credit IS DISTINCT FROM ${r.credit}
            OR carry_in IS DISTINCT FROM ${r.carry_in}
            OR manager_name IS DISTINCT FROM ${r.manager_name}
          )
      `;
  if (result.count > 0) updated += 1;
  else skipped += 1;
}

console.log(`updated=${updated} unchanged=${skipped} total=${rows.length}`);

const check = await dst`
  SELECT company_name, balance::float8 AS balance
  FROM arrears_entries
  WHERE company_name ILIKE '%파라씨앤디%'
`;
console.log('파라씨앤디 after:', check);

await src.end({ timeout: 5 });
await dst.end({ timeout: 5 });
