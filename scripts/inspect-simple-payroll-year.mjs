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
const rows = await sql`
  SELECT period_key, income_type, count(*)::int AS n,
    count(*) FILTER (WHERE filed)::int AS filed_n
  FROM simple_payroll_filings
  WHERE period_key LIKE '2026%'
  GROUP BY period_key, income_type
  ORDER BY period_key, income_type
`;
console.log('by period', JSON.stringify(rows, null, 2));

const filedClients = await sql`
  SELECT client_id, array_agg(DISTINCT income_type) AS types,
    array_agg(DISTINCT period_key) AS periods
  FROM simple_payroll_filings
  WHERE filed = true
    AND income_type IN ('employed', 'bizIncome', 'otherTax')
    AND (period_key LIKE '2026-%')
  GROUP BY client_id
  LIMIT 15
`;
console.log('filed clients sample', JSON.stringify(filedClients, null, 2));
console.log('filed client count', (
  await sql`
    SELECT count(DISTINCT client_id)::int AS n
    FROM simple_payroll_filings
    WHERE filed = true
      AND income_type IN ('employed', 'bizIncome', 'otherTax')
      AND period_key LIKE '2026-%'
  `
)[0]);

await sql.end({ timeout: 5 });
