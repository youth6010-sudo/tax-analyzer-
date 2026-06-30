/**
 * 법인번호(corporate_no)에 - 가 빠진 13자리 값을 000000-0000000 형식으로 정규화.
 *
 * node scripts/fix-corporate-no-hyphen.mjs            # dry-run (변경 없음)
 * node scripts/fix-corporate-no-hyphen.mjs --apply     # 실제 반영
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const apply = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

// 숫자 13자리인데 하이픈이 없는 법인번호 대상
const targets = await sql`
  SELECT id, company_name, corporate_no
  FROM clients
  WHERE corporate_no <> ''
    AND position('-' in corporate_no) = 0
    AND length(regexp_replace(corporate_no, '\D', '', 'g')) = 13
  ORDER BY company_name
`;

console.log(`하이픈 빠진 13자리 법인번호: ${targets.length}건`);
for (const r of targets.slice(0, 40)) {
  const d = r.corporate_no.replace(/\D/g, '');
  console.log(`  · ${r.company_name}: ${r.corporate_no} → ${d.slice(0, 6)}-${d.slice(6)}`);
}
if (targets.length > 40) console.log(`  … 외 ${targets.length - 40}건`);

if (!apply) {
  console.log('\n(dry-run) 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
  await sql.end();
  process.exit(0);
}

const res = await sql`
  UPDATE clients
  SET corporate_no =
        left(regexp_replace(corporate_no, '\D', '', 'g'), 6)
        || '-' ||
        substring(regexp_replace(corporate_no, '\D', '', 'g') from 7),
      updated_at = NOW()
  WHERE corporate_no <> ''
    AND position('-' in corporate_no) = 0
    AND length(regexp_replace(corporate_no, '\D', '', 'g')) = 13
  RETURNING id
`;

await sql.end();
console.log(`\n✓ 법인번호 하이픈 정규화: ${res.length}건`);
