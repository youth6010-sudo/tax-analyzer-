/**
 * 프로세스에서 자동 생성된 'from-process' 합성 유입관리 문의가
 * 실제 유입관리 문의와 중복될 때, 실제 문의로 통합하고 합성 문의를 제거한다.
 *
 *   node scripts/dedupe-intake-inquiries.mjs           # dry-run (변경 없음)
 *   node scripts/dedupe-intake-inquiries.mjs --apply   # 실제 반영
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { companyNamesMatch } from './lib/intake-link.mjs';

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

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

function isStub(inq) {
  return (inq.extra && inq.extra.fromProcess === true)
    || (typeof inq.excel_key === 'string' && inq.excel_key.startsWith('from-process||'));
}

function hasRealContent(inq) {
  return Boolean(
    (inq.consultant || '').trim()
    || (inq.phone || '').trim()
    || (inq.inquiry_content || '').trim()
    || (inq.contract_status || '').trim()
    || (inq.business_no || '').trim()
    || (inq.representative || '').trim()
    || (inq.extra && (inq.extra.blueholeCase || inq.extra.note)),
  );
}

const inquiries = await sql`
  SELECT id, client_id, company_name, phone, channel, consultant, inquiry_date,
         inquiry_content, contract_status, business_no, representative, extra, excel_key, created_at
  FROM intake_inquiries
`;

const stubs = inquiries.filter(isStub);
const reals = inquiries.filter(i => !isStub(i));

console.log(`전체 문의 ${inquiries.length}건 (실제 ${reals.length} / 합성 ${stubs.length})`);
console.log(`모드: ${APPLY ? 'APPLY (실제 반영)' : 'DRY-RUN (미반영)'}\n`);

let merged = 0;
let kept = 0;

for (const stub of stubs) {
  // 같은 상호의 실제 문의 찾기 (clientId 동일 우선, 그다음 상호 퍼지 매칭)
  const matches = reals.filter(r => {
    if (r.id === stub.id) return false;
    if (stub.client_id && r.client_id && stub.client_id === r.client_id) return true;
    return companyNamesMatch(stub.company_name, r.company_name);
  });

  if (!matches.length) {
    kept++;
    continue;
  }

  // 실제 내용이 있는 문의 우선, 그다음 오래된(원본) 문의 우선
  matches.sort((a, b) => {
    const ca = hasRealContent(a) ? 1 : 0;
    const cb = hasRealContent(b) ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
  const target = matches[0];

  const clientId = target.client_id ?? stub.client_id ?? null;
  const processExcelKey = stub.extra?.processExcelKey
    ?? (stub.excel_key?.startsWith('from-process||')
      ? stub.excel_key.slice('from-process||'.length)
      : null);

  console.log(`• 통합: 합성 "${stub.company_name}" → 실제 "${target.company_name}"`);
  console.log(`    실제 inquiry ${target.id} (clientId ${target.client_id ?? '-'} → ${clientId ?? '-'})`);
  console.log(`    합성 inquiry ${stub.id} 삭제 (process key: ${processExcelKey ?? '-'})`);

  merged++;
  if (!APPLY) continue;

  // 1) 실제 문의에 clientId / 프로세스 링크 보강
  const newExtra = { ...(target.extra || {}) };
  if (processExcelKey && !newExtra.processExcelKey) newExtra.processExcelKey = processExcelKey;

  await sql`
    UPDATE intake_inquiries SET
      client_id = ${clientId},
      extra = ${sql.json(newExtra)}
    WHERE id = ${target.id}
  `;

  // 2) 합성 문의가 가리키던 프로세스에 clientId 연결
  if (clientId && processExcelKey) {
    await sql`
      UPDATE intake_processes SET client_id = ${clientId}
      WHERE excel_key = ${processExcelKey} AND client_id IS NULL
    `;
  }

  // 3) 같은 상호 프로세스 중 clientId 비어있는 것 연결
  if (clientId) {
    const procs = await sql`SELECT id, company_name, client_id FROM intake_processes WHERE client_id IS NULL`;
    for (const p of procs) {
      if (companyNamesMatch(p.company_name, target.company_name)) {
        await sql`UPDATE intake_processes SET client_id = ${clientId} WHERE id = ${p.id}`;
      }
    }
  }

  // 4) 합성 문의 삭제
  await sql`DELETE FROM intake_inquiries WHERE id = ${stub.id}`;
}

console.log(`\n완료: 통합 ${merged}건, 단독 유지(합성) ${kept}건`);
if (!APPLY && merged) console.log('실제 반영하려면 --apply 옵션으로 다시 실행하세요.');
await sql.end();
