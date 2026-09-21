/**
 * Neon → 활성 DB 공문 전체 복원 (letter/ledger/payment 모두, 코드 매칭)
 * node scripts/restore-all-letters-from-neon.mjs
 */
import fs from 'node:fs';
import postgres from 'postgres';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const destUrl = env.DATABASE_URL;
const sourceUrl = env.PREV_DATABASE_URL;
if (!destUrl || !sourceUrl) {
  console.error('DATABASE_URL / PREV_DATABASE_URL required');
  process.exit(1);
}

const src = postgres(sourceUrl, { max: 1, prepare: false, connect_timeout: 25 });
const dst = postgres(destUrl, { max: 1, prepare: false, connect_timeout: 25 });

const neonEntries = await src`
  SELECT e.id, e.external_code, e.company_name,
    (SELECT count(*)::int FROM arrears_letter_lines l WHERE l.arrears_entry_id = e.id) AS total_n
  FROM arrears_entries e
  WHERE EXISTS (
    SELECT 1 FROM arrears_letter_lines l WHERE l.arrears_entry_id = e.id
  )
  ORDER BY e.external_code
`;

console.log('Neon entries with any lines:', neonEntries.length);

let restored = 0;
let skippedNoDest = 0;
let linesCopied = 0;

for (const ne of neonEntries) {
  const [dest] = await dst`
    SELECT id, company_name FROM arrears_entries
    WHERE external_code = ${ne.external_code}
    LIMIT 1
  `;
  if (!dest) {
    skippedNoDest += 1;
    continue;
  }

  const lines = await src`
    SELECT sort_order, description, amount, paid_amount, paid_date, source
    FROM arrears_letter_lines
    WHERE arrears_entry_id = ${ne.id}
    ORDER BY sort_order, created_at
  `;
  if (!lines.length) continue;

  await dst.begin(async tx => {
    await tx`DELETE FROM arrears_letter_lines WHERE arrears_entry_id = ${dest.id}`;
    let order = 0;
    for (const l of lines) {
      await tx`
        INSERT INTO arrears_letter_lines (
          arrears_entry_id, sort_order, description, amount, paid_amount, paid_date, source
        ) VALUES (
          ${dest.id},
          ${order},
          ${l.description ?? ''},
          ${Math.round(Number(l.amount) || 0)},
          ${Math.round(Number(l.paid_amount) || 0)},
          ${l.paid_date ?? ''},
          ${l.source || 'letter'}
        )
      `;
      order += 1;
    }
  });

  restored += 1;
  linesCopied += lines.length;
}

const after = await dst`
  SELECT
    (SELECT count(*)::int FROM arrears_letter_lines) AS lines,
    (SELECT count(*)::int FROM arrears_letter_lines WHERE description ~ '2026년\\s*7월|2026년7월|26년\\s*7월|26년7월') AS julish,
    (SELECT count(*)::int FROM arrears_letter_lines WHERE description ~ '2026년\\s*8월|2026년8월|26년\\s*8월|26년8월') AS augish,
    (SELECT count(*)::int FROM arrears_letter_lines WHERE description ~ '2026년\\s*9월|2026년9월|26년\\s*9월|26년9월') AS sepish
`;

console.log({ restored, skippedNoDest, linesCopied, after: after[0] });

const sample = await dst`
  SELECT description, amount::float8 AS amount, source
  FROM arrears_letter_lines
  WHERE arrears_entry_id = (SELECT id FROM arrears_entries WHERE external_code='00154' LIMIT 1)
  ORDER BY sort_order
`;
console.log('00154 after', sample);

await src.end({ timeout: 5 });
await dst.end({ timeout: 5 });
