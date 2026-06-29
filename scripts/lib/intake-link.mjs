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

function stripBranchCount(name) {
  return String(name ?? '')
    .replace(/\s*[*xX×]\s*\d+\s*$/, '')
    .replace(/\s*\d+\s*(곳|개소|개점|개)\s*$/, '')
    .replace(/\s*외\s*\d+\s*(곳|개소|개점|개)?\s*$/, '')
    .trim();
}

function coreKey(name) {
  let s = String(name ?? '').trim().normalize('NFKC').replace(/\s+/g, '');
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/^\(주\)/i, '')
      .replace(/^㈜/, '')
      .replace(/^주식회사/i, '')
      .replace(/^\(유\)/i, '')
      .replace(/^유한회사/i, '')
      .replace(/^\(사\)/i, '');
  }
  return s.toLowerCase();
}

export function companyKeys(name) {
  const trimmed = String(name ?? '').trim().normalize('NFKC');
  if (!trimmed) return [];
  const keys = new Set();
  const add = s => {
    const n = String(s ?? '').replace(/\s+/g, '').toLowerCase();
    if (n) keys.add(n);
    const c = coreKey(s);
    if (c) keys.add(c);
  };
  add(trimmed);
  add(trimmed.split(',')[0] ?? '');
  add(trimmed.replace(/\([^)]*\)/g, ''));
  const noBranch = stripBranchCount(trimmed);
  if (noBranch && noBranch !== trimmed) add(noBranch);
  return [...keys];
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function keysSimilar(a, b) {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return false;
  const dist = editDistance(a, b);
  if (dist <= 1) return true;
  if (dist <= 2 && Math.max(a.length, b.length) >= 10) return true;
  return (1 - dist / Math.max(a.length, b.length)) >= 0.9;
}

export function companyNamesMatch(a, b) {
  const ka = companyKeys(a);
  const kb = companyKeys(b);
  if (!ka.length || !kb.length) return false;
  if (ka.some(x => kb.includes(x))) return true;
  for (const x of ka) {
    for (const y of kb) {
      if (keysSimilar(x, y)) return true;
    }
  }
  return false;
}

export function inquiryMatchesProcess(inquiry, process) {
  const processExcelKey = pick(process, 'excelKey', 'excel_key');
  const inquiryExcelKey = pick(inquiry, 'excelKey', 'excel_key');
  if (processExcelKey && inquiryExcelKey === inquiryExcelKeyFromProcess(processExcelKey)) return true;

  const linkedProcessKey = typeof inquiry.extra?.processExcelKey === 'string'
    ? inquiry.extra.processExcelKey.trim()
    : '';
  if (linkedProcessKey && processExcelKey && linkedProcessKey === processExcelKey) return true;

  return companyNamesMatch(
    pick(process, 'companyName', 'company_name'),
    pick(inquiry, 'companyName', 'company_name'),
  );
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
