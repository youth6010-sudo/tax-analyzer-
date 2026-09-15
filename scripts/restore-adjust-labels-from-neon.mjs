/**
 * Neon 공문 원문이 연도 없는 조정 품목인데, 활성 DB만 「N년 조정료」로
 * 바뀐 줄을 원문으로 되돌림.
 *
 *   npx tsx scripts/restore-adjust-labels-from-neon.mjs           # dry-run
 *   npx tsx scripts/restore-adjust-labels-from-neon.mjs --apply
 */
import fs from 'node:fs';
import postgres from 'postgres';

const apply = process.argv.includes('--apply');

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const dst = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 25 });
const src = postgres(env.PREV_DATABASE_URL, { max: 1, prepare: false, connect_timeout: 25 });

const PLAIN =
  /^(법인조정료|세무조정료|조정료|조정수수료|개인조정료)$/;

const yearAdj = await dst`
  SELECT e.external_code, e.company_name, l.id, l.description,
         l.amount::float8 AS amount, l.source
  FROM arrears_letter_lines l
  JOIN arrears_entries e ON e.id = l.arrears_entry_id
  WHERE regexp_replace(l.description, '\\s', '', 'g')
        ~ '^(20)?\\d{2}년.*(법인조정료|세무조정료|조정료|조정수수료|개인조정료)'
  ORDER BY e.external_code, l.sort_order
`;

const candidates = [];
for (const r of yearAdj) {
  const neon = await src`
    SELECT l.description
    FROM arrears_letter_lines l
    JOIN arrears_entries e ON e.id = l.arrears_entry_id
    WHERE e.external_code = ${r.external_code}
      AND round(l.amount::numeric) = ${Math.round(r.amount)}
    ORDER BY l.sort_order
  `;
  const plain = neon.filter(n => PLAIN.test(String(n.description || '').replace(/\s+/g, '')));
  if (plain.length !== 1) continue;
  const to = String(plain[0].description).trim();
  if (to === String(r.description).trim()) continue;
  candidates.push({
    id: r.id,
    code: r.external_code,
    company: r.company_name,
    from: r.description,
    to,
    amount: r.amount,
    source: r.source,
  });
}

console.log(`${apply ? 'APPLY' : 'DRY-RUN'} candidates:`, candidates.length);
for (const c of candidates) {
  console.log(`${c.code} ${c.company}: "${c.from}" → "${c.to}" (${c.amount}) [${c.source}]`);
}

if (apply && candidates.length) {
  for (const c of candidates) {
    await dst`
      UPDATE arrears_letter_lines
      SET description = ${c.to}
      WHERE id = ${c.id}
    `;
  }
  console.log('Updated', candidates.length, 'rows');
}

fs.writeFileSync(
  'scripts/_restore-adjust-labels-result.json',
  JSON.stringify({ apply, candidates }, null, 2),
);

await src.end();
await dst.end();
