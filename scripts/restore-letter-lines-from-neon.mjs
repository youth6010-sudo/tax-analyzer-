/**
 * Neon(PREV)에 있는 공문(letter) 내역을 Supabase(활성 DATABASE_URL)로 복구.
 * 전기이월 플러그로 덮인 상세를 기존 공문 원문으로 되돌림.
 *
 *   node scripts/restore-letter-lines-from-neon.mjs
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
if (!destUrl || !/supabase/i.test(destUrl)) {
  console.error('DATABASE_URL must be active Supabase');
  process.exit(1);
}
if (!sourceUrl || !/neon\.tech/i.test(sourceUrl)) {
  console.error('PREV_DATABASE_URL must be Neon (letter source)');
  process.exit(1);
}

const src = postgres(sourceUrl, { max: 1, prepare: false, connect_timeout: 25 });
const dst = postgres(destUrl, { max: 1, prepare: false, connect_timeout: 25 });

const neonEntries = await src`
  SELECT e.id, e.external_code, e.company_name,
    (SELECT count(*)::int FROM arrears_letter_lines l
      WHERE l.arrears_entry_id = e.id AND l.source = 'letter') AS letter_n,
    (SELECT count(*)::int FROM arrears_letter_lines l
      WHERE l.arrears_entry_id = e.id) AS total_n
  FROM arrears_entries e
  WHERE EXISTS (
    SELECT 1 FROM arrears_letter_lines l
    WHERE l.arrears_entry_id = e.id AND l.source = 'letter'
  )
  ORDER BY e.external_code
`;

console.log('Neon entries with letter:', neonEntries.length);

let restored = 0;
let skippedNoDest = 0;
let skippedEmpty = 0;
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
  if (!lines.length) {
    skippedEmpty += 1;
    continue;
  }

  await dst.begin(async (tx) => {
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
  if (restored <= 5 || ne.external_code === '00170' || /파라씨앤디|하나비|오프라인/.test(ne.company_name)) {
    console.log(
      `  ✓ ${ne.external_code} ${ne.company_name} → ${lines.length} lines (letter=${ne.letter_n})`,
    );
  }
}

const after = await dst`
  SELECT source, count(*)::int AS c FROM arrears_letter_lines GROUP BY 1 ORDER BY 2 DESC
`;
const carryOnly = await dst`
  SELECT count(*)::int AS c FROM (
    SELECT e.id
    FROM arrears_entries e
    LEFT JOIN arrears_letter_lines l ON l.arrears_entry_id = e.id
    GROUP BY e.id
    HAVING count(l.*) FILTER (WHERE l.description ~ '전기이월') > 0
       AND count(l.*) FILTER (WHERE l.source = 'letter') = 0
       AND max(e.balance)::float8 <> 0
  ) t
`;
const sample = await dst`
  SELECT description, amount::float8 AS amount, source
  FROM arrears_letter_lines
  WHERE arrears_entry_id = (SELECT id FROM arrears_entries WHERE external_code='00170' LIMIT 1)
  ORDER BY sort_order
  LIMIT 8
`;

console.log({
  restored,
  skippedNoDest,
  skippedEmpty,
  linesCopied,
  after,
  carryOnlyNoLetter: carryOnly[0].c,
  sample00170: sample,
});

await src.end({ timeout: 5 });
await dst.end({ timeout: 5 });
