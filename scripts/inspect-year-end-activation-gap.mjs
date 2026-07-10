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

// 간이지급 접수됐는데 incomeTypes.employed 등이 꺼진 업체
const rows = await sql`
  SELECT c.id, c.company_name, c.manager,
    sp.income_type, sp.period_key,
    c.intake_data->'incomeTypes' AS income_types
  FROM simple_payroll_filings sp
  JOIN clients c ON c.id = sp.client_id
  WHERE sp.filed = true
    AND sp.income_type IN ('employed', 'bizIncome', 'otherTax')
    AND sp.period_key LIKE '2026%'
    AND (
      (sp.income_type = 'employed' AND COALESCE((c.intake_data->'incomeTypes'->>'employed')::boolean, false) = false)
      OR (sp.income_type = 'bizIncome' AND COALESCE((c.intake_data->'incomeTypes'->>'bizIncome')::boolean, false) = false)
      OR (sp.income_type = 'otherTax' AND COALESCE((c.intake_data->'incomeTypes'->>'otherTax')::boolean, false) = false)
    )
  ORDER BY c.company_name
  LIMIT 30
`;
console.log('filed but incomeTypes off', JSON.stringify(rows, null, 2));
console.log('count', rows.length);

await sql.end({ timeout: 5 });
