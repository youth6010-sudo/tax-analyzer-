import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const ye = await sql`
  SELECT year, income_type, count(*)::int AS n,
    count(*) FILTER (WHERE filed)::int AS filed_n
  FROM year_end_filings
  GROUP BY year, income_type
  ORDER BY year DESC, income_type
`;
console.log('year_end_filings', JSON.stringify(ye, null, 2));

// 리아 담당 + 간이지급 근로 접수된 업체가 연말정산 그리드 로직상 active여야 함
const gap = await sql`
  WITH filed AS (
    SELECT DISTINCT client_id, income_type
    FROM simple_payroll_filings
    WHERE filed = true
      AND income_type IN ('employed', 'bizIncome', 'otherTax')
      AND period_key LIKE '2026%'
  )
  SELECT c.company_name, c.manager, f.income_type,
    c.intake_data->'incomeTypes' AS income_types,
    c.intake_data->'yearEndTypes' AS year_end_types
  FROM filed f
  JOIN clients c ON c.id = f.client_id
  WHERE c.manager = '리아'
  ORDER BY c.company_name, f.income_type
`;
console.log('리아 filed SP for YE', JSON.stringify(gap, null, 2));
console.log('count', gap.length);

await sql.end({ timeout: 5 });
