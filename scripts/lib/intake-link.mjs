/**
 * 유입프로세스만 있고 유입관리가 없을 때 자동 연결용 스텁
 */

function pick(row, camel, snake) {
  if (row?.[camel] != null && row[camel] !== '') return row[camel];
  if (snake && row?.[snake] != null && row[snake] !== '') return row[snake];
  return undefined;
}

export function inquiryExcelKeyFromProcess(processExcelKey) {
  return `from-process||${processExcelKey}`;
}

export function stubInquiryFromProcessRow(process) {
  const excelKey = pick(process, 'excelKey', 'excel_key');
  return {
    excelKey: inquiryExcelKeyFromProcess(excelKey),
    companyName: pick(process, 'companyName', 'company_name') ?? '',
    phone: '',
    channel: pick(process, 'channel', 'channel') ?? '',
    consultant: '',
    inquiryDate: pick(process, 'feeStartDate', 'fee_start_date') ?? '',
    inquiryContent: '',
    contractStatus: '',
    proposedFee: pick(process, 'monthlyFee', 'monthly_fee') ?? null,
    industry: '',
    businessNo: '',
    representative: '',
    address: '',
    extra: {
      fromProcess: true,
      processExcelKey: excelKey,
    },
  };
}

function companyKeys(name) {
  const trimmed = String(name ?? '').trim().normalize('NFKC');
  if (!trimmed) return [];
  const keys = new Set();
  const add = s => {
    const n = s.replace(/\s+/g, '').toLowerCase();
    if (n) keys.add(n);
  };
  add(trimmed);
  add(trimmed.split(',')[0] ?? '');
  add(trimmed.replace(/\([^)]*\)/g, ''));
  return [...keys];
}

export function inquiryMatchesProcess(inquiry, process) {
  const processExcelKey = pick(process, 'excelKey', 'excel_key');
  const inquiryExcelKey = pick(inquiry, 'excelKey', 'excel_key');
  if (processExcelKey && inquiryExcelKey === inquiryExcelKeyFromProcess(processExcelKey)) return true;

  const linkedProcessKey = typeof inquiry.extra?.processExcelKey === 'string'
    ? inquiry.extra.processExcelKey.trim()
    : '';
  if (linkedProcessKey && processExcelKey && linkedProcessKey === processExcelKey) return true;

  const pKeys = companyKeys(pick(process, 'companyName', 'company_name'));
  const iKeys = companyKeys(pick(inquiry, 'companyName', 'company_name'));
  if (!pKeys.length || !iKeys.length) return false;
  return pKeys.some(pk => iKeys.includes(pk));
}

export async function upsertInquiryFromProcess(process, clientId, db) {
  const row = stubInquiryFromProcessRow(process);
  const processExcelKey = pick(process, 'excelKey', 'excel_key');
  const existing = await db`
    SELECT id FROM intake_inquiries WHERE excel_key = ${row.excelKey} LIMIT 1
  `;
  if (existing.length) {
    await db`
      UPDATE intake_inquiries SET
        client_id = ${clientId},
        company_name = ${row.companyName},
        channel = ${row.channel},
        inquiry_date = ${row.inquiryDate},
        proposed_fee = ${row.proposedFee},
        extra = ${db.json(row.extra)}
      WHERE id = ${existing[0].id}
    `;
  } else {
    await db`
      INSERT INTO intake_inquiries (
        client_id, company_name, phone, channel, consultant, inquiry_date,
        inquiry_content, contract_status, proposed_fee, industry, business_no,
        representative, address, extra, excel_key
      ) VALUES (
        ${clientId}, ${row.companyName}, ${row.phone}, ${row.channel}, ${row.consultant},
        ${row.inquiryDate}, ${row.inquiryContent}, ${row.contractStatus}, ${row.proposedFee},
        ${row.industry}, ${row.businessNo}, ${row.representative}, ${row.address},
        ${db.json(row.extra)}, ${row.excelKey}
      )
    `;
  }
  if (clientId && processExcelKey) {
    await db`
      UPDATE intake_processes SET client_id = ${clientId}
      WHERE excel_key = ${processExcelKey} AND client_id IS NULL
    `;
  }
  return existing.length ? 'updated' : 'inserted';
}
