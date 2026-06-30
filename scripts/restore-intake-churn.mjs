/**
 * 백업 JSON에서 유입관리·유입프로세스·유출만 복원하고 현재 수임처에 client_id 재연결.
 * node scripts/restore-intake-churn.mjs [백업.json]
 *
 * - clients roster는 건드리지 않는다.
 * - excel_key 기준 upsert (멱등). 원본 id·일자 보존.
 * - client_id는 현재 clients와 사업자번호 / 상호+담당 / 상호 매칭으로 다시 연결.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
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
}

loadEnv();

const backupPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || root, 'Desktop', 'tax-analyzer-backup-20260630-163444.json');

if (!fs.existsSync(backupPath)) {
  console.error('백업 파일을 찾을 수 없습니다:', backupPath);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const t = backup.tables ?? {};
const inquiries = t.intake_inquiries ?? [];
const processes = t.intake_processes ?? [];
const churns = t.churn_records ?? [];
console.log(`백업: 유입 ${inquiries.length} · 프로세스 ${processes.length} · 유출 ${churns.length} ← ${path.basename(backupPath)}`);

const normBiz = v => String(v ?? '').replace(/\D/g, '');
const normName = v => String(v ?? '').trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const sql = postgres(dbUrl, { max: 1 });

const clientRows = await sql`SELECT id, company_name, manager, business_no FROM clients`;
const byBiz = new Map();
const byFull = new Map();
const byName = new Map();
for (const r of clientRows) {
  const biz = normBiz(r.business_no);
  if (biz.length >= 10 && !byBiz.has(biz)) byBiz.set(biz, r.id);
  const full = `${String(r.company_name).trim()}||${String(r.manager).trim()}`;
  if (!byFull.has(full)) byFull.set(full, r.id);
  const nameKey = normName(r.company_name);
  if (nameKey && !byName.has(nameKey)) byName.set(nameKey, r.id);
}

function resolveClientId(companyName, manager, businessNo) {
  const biz = normBiz(businessNo);
  if (biz.length >= 10 && byBiz.has(biz)) return byBiz.get(biz);
  const trimmed = String(companyName ?? '').trim();
  if (manager) {
    const full = `${trimmed}||${String(manager).trim()}`;
    if (byFull.has(full)) return byFull.get(full);
  }
  const nameKey = normName(trimmed);
  if (nameKey && byName.has(nameKey)) return byName.get(nameKey);
  return null;
}

const jsonOrEmpty = v => (v && typeof v === 'object' ? v : {});
const toDate = v => (v ? new Date(v) : null);

let inqLinked = 0;
let procLinked = 0;
let churnLinked = 0;

await sql.begin(async tx => {
  for (const row of inquiries) {
    const clientId = resolveClientId(row.company_name, row.consultant || null, row.business_no);
    if (clientId) inqLinked++;
    await tx`
      INSERT INTO intake_inquiries (
        id, client_id, company_name, phone, channel, consultant, inquiry_date,
        inquiry_content, contract_status, proposed_fee, industry, business_no,
        representative, address, extra, excel_key, created_at
      ) VALUES (
        ${row.id}, ${clientId}, ${row.company_name}, ${row.phone ?? ''}, ${row.channel ?? ''},
        ${row.consultant ?? ''}, ${row.inquiry_date ?? ''}, ${row.inquiry_content ?? ''},
        ${row.contract_status ?? ''}, ${row.proposed_fee ?? null}, ${row.industry ?? ''},
        ${row.business_no ?? ''}, ${row.representative ?? ''}, ${row.address ?? ''},
        ${tx.json(jsonOrEmpty(row.extra))}, ${row.excel_key}, ${toDate(row.created_at) ?? new Date()}
      )
      ON CONFLICT (excel_key) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        company_name = EXCLUDED.company_name,
        phone = EXCLUDED.phone,
        channel = EXCLUDED.channel,
        consultant = EXCLUDED.consultant,
        inquiry_date = EXCLUDED.inquiry_date,
        inquiry_content = EXCLUDED.inquiry_content,
        contract_status = EXCLUDED.contract_status,
        proposed_fee = EXCLUDED.proposed_fee,
        industry = EXCLUDED.industry,
        business_no = EXCLUDED.business_no,
        representative = EXCLUDED.representative,
        address = EXCLUDED.address,
        extra = EXCLUDED.extra
    `;
  }

  for (const row of processes) {
    const clientId = resolveClientId(row.company_name, null, null);
    if (clientId) procLinked++;
    await tx`
      INSERT INTO intake_processes (
        id, client_id, company_name, fee_start_date, monthly_fee, channel, checklist, excel_key, updated_at
      ) VALUES (
        ${row.id}, ${clientId}, ${row.company_name}, ${row.fee_start_date ?? ''}, ${row.monthly_fee ?? null},
        ${row.channel ?? ''}, ${tx.json(jsonOrEmpty(row.checklist))}, ${row.excel_key}, ${toDate(row.updated_at) ?? new Date()}
      )
      ON CONFLICT (excel_key) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        company_name = EXCLUDED.company_name,
        fee_start_date = EXCLUDED.fee_start_date,
        monthly_fee = EXCLUDED.monthly_fee,
        channel = EXCLUDED.channel,
        checklist = EXCLUDED.checklist,
        updated_at = EXCLUDED.updated_at
    `;
  }

  for (const row of churns) {
    const clientId = resolveClientId(row.company_name, row.manager, row.business_no);
    if (clientId) churnLinked++;
    const churnedAt = toDate(row.churned_at) ?? new Date();
    if (row.excel_key) {
      await tx`
        INSERT INTO churn_records (
          id, client_id, company_name, reason, detail, churn_type, data_cleanup, early_sign,
          fee_amount, manager, excel_key, churned_at, recorded_by_user_id
        ) VALUES (
          ${row.id}, ${clientId}, ${row.company_name ?? ''}, ${row.reason ?? '기타'}, ${row.detail ?? ''},
          ${row.churn_type ?? ''}, ${row.data_cleanup ?? ''}, ${row.early_sign ?? ''}, ${row.fee_amount ?? null},
          ${row.manager ?? ''}, ${row.excel_key}, ${churnedAt}, ${row.recorded_by_user_id ?? null}
        )
        ON CONFLICT (excel_key) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          company_name = EXCLUDED.company_name,
          reason = EXCLUDED.reason,
          detail = EXCLUDED.detail,
          churn_type = EXCLUDED.churn_type,
          data_cleanup = EXCLUDED.data_cleanup,
          early_sign = EXCLUDED.early_sign,
          fee_amount = EXCLUDED.fee_amount,
          manager = EXCLUDED.manager,
          churned_at = EXCLUDED.churned_at
      `;
    } else {
      await tx`
        INSERT INTO churn_records (
          id, client_id, company_name, reason, detail, churn_type, data_cleanup, early_sign,
          fee_amount, manager, churned_at, recorded_by_user_id
        ) VALUES (
          ${row.id}, ${clientId}, ${row.company_name ?? ''}, ${row.reason ?? '기타'}, ${row.detail ?? ''},
          ${row.churn_type ?? ''}, ${row.data_cleanup ?? ''}, ${row.early_sign ?? ''}, ${row.fee_amount ?? null},
          ${row.manager ?? ''}, ${churnedAt}, ${row.recorded_by_user_id ?? null}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
  }
});

await sql.end();
console.log(`✓ 복원 완료`);
console.log(`  유입: ${inquiries.length}건 (client 재연결 ${inqLinked})`);
console.log(`  프로세스: ${processes.length}건 (client 재연결 ${procLinked})`);
console.log(`  유출: ${churns.length}건 (client 재연결 ${churnLinked})`);
