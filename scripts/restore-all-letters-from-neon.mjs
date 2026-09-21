/**
 * Neon → 활성 DB 공문 전체 복원 (letter/ledger/payment 모두, 코드 매칭)
 *
 * ⛔ 금지: 저번주(2026-09-15) 법인조정료·공문 원문 확정본을 Neon이 덮어씀.
 * 08.31 고정 기준은 Supabase LIVE(확정 작업 후)이며 Neon(PREV)이 아님.
 * 강제 실행: FORCE_NEON_LETTER_OVERWRITE=1 node scripts/restore-all-letters-from-neon.mjs
 */
import fs from 'node:fs';
import postgres from 'postgres';

if (process.env.FORCE_NEON_LETTER_OVERWRITE !== '1') {
  console.error(
    [
      'BLOCKED: Neon 공문 통째 복원은 08.31 최종 확정본(저번주 조정료 원문 복구 이후 LIVE)을 깨뜨립니다.',
      '확정본 기준 고정: 2026-09-15 adafe0c 이후 Supabase 공문. Neon은 PREV 스냅샷일 뿐.',
      '정말 필요하면 FORCE_NEON_LETTER_OVERWRITE=1 로만 실행하세요.',
    ].join('\n'),
  );
  process.exit(2);
}

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
