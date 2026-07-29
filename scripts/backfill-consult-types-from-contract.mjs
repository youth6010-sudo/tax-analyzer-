/**
 * 기존 유입관리 계약유무 → 문의유형 백필
 * - 계약완료 / 보류 / 실패 → 기장문의
 * - 비어 있거나 "-" → 신고문의
 *
 * node scripts/backfill-consult-types-from-contract.mjs
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
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const BOOKKEEPING = new Set(['계약완료', '보류', '실패']);

function parseConsultTypes(raw) {
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n|,/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
}

function isDashOrEmpty(v) {
  const s = String(v ?? '').trim();
  return !s || s === '-' || s === '—' || s === '–';
}

function resolveConsultType(contractStatus) {
  const status = String(contractStatus ?? '').trim();
  if (BOOKKEEPING.has(status)) return '기장문의';
  if (isDashOrEmpty(status)) return '신고문의';
  return null;
}

async function main() {
  const rows = await sql`
    SELECT id, company_name, contract_status, extra
    FROM intake_inquiries
    WHERE COALESCE(extra->>'draft', 'false') <> 'true'
  `;

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const row of rows) {
    const extra = row.extra && typeof row.extra === 'object' ? { ...row.extra } : {};
    const form = extra.form && typeof extra.form === 'object' ? { ...extra.form } : {};
    const existing = parseConsultTypes(form.consultTypes);
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    const nextType = resolveConsultType(row.contract_status);
    if (!nextType) {
      unchanged += 1;
      continue;
    }

    form.consultTypes = [nextType];
    extra.form = form;

    await sql`
      UPDATE intake_inquiries
      SET extra = ${sql.json(extra)}
      WHERE id = ${row.id}
    `;
    updated += 1;
    console.log(`${row.company_name || '(무명)'} :: ${row.contract_status || '-'} → ${nextType}`);
  }

  console.log(JSON.stringify({ total: rows.length, updated, skippedHasTypes: skipped, unchanged }, null, 2));
  await sql.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
