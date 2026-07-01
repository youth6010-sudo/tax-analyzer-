// 기존 taxFlags·근로내역(Y/N) → intake_data.incomeTypes 일괄 변환
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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

function yn(value) {
  if (value === true) return true;
  if (value == null || value === false) return false;
  const s = String(value).trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1' || s === 'O';
}

function migrateIncomeTypes(intakeData) {
  const flags =
    intakeData?.taxFlags && typeof intakeData.taxFlags === 'object' ? intakeData.taxFlags : {};
  const existing =
    intakeData?.incomeTypes && typeof intakeData.incomeTypes === 'object' ? intakeData.incomeTypes : null;

  const out = {
    employed: false,
    daily: false,
    bizIncome: false,
    retirement: false,
    otherTax: false,
    laborContentReport: false,
    interestDividend: false,
  };

  const keys = ['employed', 'daily', 'bizIncome', 'retirement', 'otherTax', 'laborContentReport'];
  for (const key of keys) {
    if (existing && typeof existing[key] === 'boolean') out[key] = existing[key];
    else if (key === 'laborContentReport') out.laborContentReport = yn(existing?.laborContentReport) || yn(intakeData?.payrollHistory);
    else if (key in flags) out[key] = yn(flags[key]);
  }

  if (existing && typeof existing.interestDividend === 'boolean') out.interestDividend = existing.interestDividend;
  else out.interestDividend = yn(flags.interestDividend);

  return out;
}

const sql = postgres(url, { max: 4, prepare: false });

try {
  const rows = await sql`SELECT id, intake_data FROM clients`;
  let updated = 0;
  for (const row of rows) {
    const intake = row.intake_data && typeof row.intake_data === 'object' ? row.intake_data : {};
    const incomeTypes = migrateIncomeTypes(intake);
    const prevFlags =
      intake.taxFlags && typeof intake.taxFlags === 'object' ? intake.taxFlags : {};
    const next = {
      ...intake,
      incomeTypes,
      taxFlags: {
        ...prevFlags,
        employed: incomeTypes.employed,
        daily: incomeTypes.daily,
        retirement: incomeTypes.retirement,
        bizIncome: incomeTypes.bizIncome,
        interestDividend: incomeTypes.interestDividend,
        otherTax: incomeTypes.otherTax,
        laborContentReport: incomeTypes.laborContentReport,
      },
    };
    await sql`UPDATE clients SET intake_data = ${sql.json(next)}, updated_at = now() WHERE id = ${row.id}`;
    updated += 1;
  }
  console.log(`migrated incomeTypes for ${updated} clients`);
} finally {
  await sql.end({ timeout: 5 });
}
