/**
 * 청년들 ID.xlsx 운영 시트(유입관리·유입프로세스·유출) 파서 — 서버(관리자 업로드)용.
 *
 * scripts/lib/youth-workbook-parse.mjs 의 운영 데이터 파싱 로직을 TypeScript로 옮긴 것.
 * roster(수임처관리) 시트는 다루지 않는다.
 */
import * as XLSX from 'xlsx';

export type InquiryParsed = {
  excelKey: string;
  companyName: string;
  phone: string;
  channel: string;
  consultant: string;
  inquiryDate: string;
  inquiryContent: string;
  contractStatus: string;
  proposedFee: number | null;
  industry: string;
  businessNo: string;
  representative: string;
  address: string;
  extra: Record<string, unknown>;
};

export type ProcessParsed = {
  excelKey: string;
  companyName: string;
  feeStartDate: string;
  monthlyFee: number | null;
  channel: string;
  checklist: Record<string, boolean>;
};

export type ChurnParsed = {
  excelKey: string;
  companyName: string;
  churnedAt: string;
  feeAmount: number | null;
  dataCleanup: string;
  churnType: string;
  earlySign: string;
  reason: string;
  manager: string;
  businessNo: string;
  representative: string;
};

export type ParsedOperational = {
  inquiries: InquiryParsed[];
  processes: ProcessParsed[];
  churns: ChurnParsed[];
  sheets: { inquiries: boolean; processes: boolean; churns: boolean };
};

const CHECKLIST_KEYS = [
  'contractSent', 'consent', 'cms', 'assignee', 'programClient',
  'blueholeClient', 'tpClient', 'semoReport', 'bizAccount', 'kakaoRoom',
];

type Cell = string | number | boolean | null | undefined;
type Row = Cell[];

export function cellText(value: Cell): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && value > 1000000000) return String(Math.trunc(value));
  return String(value).trim();
}

export function parseBool(value: Cell): boolean {
  if (value === true || value === 'O' || value === 'o' || value === 'Y') return true;
  if (value === false || value === 'X' || value === 'x' || value === 'N' || value === '') return false;
  return Boolean(value);
}

function excelDateSerial(v: Cell): string {
  if (typeof v === 'number' && v > 30000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return cellText(v);
}

function headerIndex(headerRow: Row, ...names: string[]): number {
  for (const name of names) {
    const idx = headerRow.findIndex(h => cellText(h).includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function normBizNo(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeCompanyKey(name: unknown): string {
  return String(name ?? '')
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const PLACEHOLDER_NAMES = /^(테스트|test|관리|미입력|샘플|sample|tbd|없음|-)$/i;
const BUSINESS_HINTS =
  /주식회사|\(주\)|㈜|유한회사|유한책임|법인|컴퍼니|company|협동|재단|학원|병원|의원|식당|카페|센터|스토어|shop|inc|corp|협회|공방|공사|건설|물류|무역|산업|테크|tech|studio|스튜디오/i;

/** 담당·이름(대표자=상호)만 있고 업체 정보가 없는 행 판별 */
export function isManagerNameOnlyRow(row: {
  companyName?: string;
  representative?: string;
  businessNo?: string;
}): boolean {
  const companyName = String(row.companyName ?? '').trim();
  const representative = String(row.representative ?? '').trim();
  const businessNo = normBizNo(row.businessNo);

  if (!companyName) return false;
  if (businessNo.length >= 10) return false;
  if (PLACEHOLDER_NAMES.test(companyName)) return true;
  if (!representative) return false;
  if (BUSINESS_HINTS.test(companyName)) return false;
  if (companyName === representative && /^[가-힣]{2,4}$/.test(companyName)) return true;
  return false;
}

function parseIntakeInquiries(rows: Row[]): InquiryParsed[] {
  if (!rows.length) return [];
  const h = rows[0].map(cellText);
  const col = {
    inquiryDate: headerIndex(h, '문의일'),
    companyName: headerIndex(h, '업체명'),
    phone: headerIndex(h, '전화'),
    channel: headerIndex(h, '유입'),
    consultant: headerIndex(h, '초회'),
    inquiryContent: headerIndex(h, '문의내'),
    blueholeCase: headerIndex(h, '블루홀케이스', '블루홀'),
    note: headerIndex(h, '특이'),
    proposedFee: headerIndex(h, '제안'),
    industry: headerIndex(h, '업종'),
    businessNo: headerIndex(h, '사업자'),
    representative: headerIndex(h, '대표자'),
    repPhone: headerIndex(h, '대표 연락'),
    admin: headerIndex(h, '관리자'),
    adminPhone: headerIndex(h, '관리자 연락'),
    address: headerIndex(h, '주소'),
    email: headerIndex(h, '이메일'),
    contractStatus: headerIndex(h, '계약'),
  };

  const out: InquiryParsed[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const companyName = col.companyName >= 0 ? cellText(row[col.companyName]) : '';
    const phone = col.phone >= 0 ? cellText(row[col.phone]) : '';
    if (!companyName && !phone) continue;
    const key = `inquiry||${r}||${companyName || phone}`;
    out.push({
      excelKey: key,
      companyName: companyName || '(미입력)',
      phone,
      channel: col.channel >= 0 ? cellText(row[col.channel]) : '',
      consultant: col.consultant >= 0 ? cellText(row[col.consultant]) : '',
      inquiryDate: col.inquiryDate >= 0 ? excelDateSerial(row[col.inquiryDate]) : '',
      inquiryContent: col.inquiryContent >= 0 ? cellText(row[col.inquiryContent]) : '',
      contractStatus: col.contractStatus >= 0 ? cellText(row[col.contractStatus]) : '',
      proposedFee:
        col.proposedFee >= 0 && typeof row[col.proposedFee] === 'number'
          ? (row[col.proposedFee] as number)
          : null,
      industry: col.industry >= 0 ? cellText(row[col.industry]) : '',
      businessNo: col.businessNo >= 0 ? cellText(row[col.businessNo]) : '',
      representative: col.representative >= 0 ? cellText(row[col.representative]) : '',
      address: col.address >= 0 ? cellText(row[col.address]) : '',
      extra: {
        blueholeCase: col.blueholeCase >= 0 ? cellText(row[col.blueholeCase]) : '',
        note: col.note >= 0 ? cellText(row[col.note]) : '',
        repPhone: col.repPhone >= 0 ? cellText(row[col.repPhone]) : '',
        admin: col.admin >= 0 ? cellText(row[col.admin]) : '',
        adminPhone: col.adminPhone >= 0 ? cellText(row[col.adminPhone]) : '',
        email: col.email >= 0 ? cellText(row[col.email]) : '',
      },
    });
  }
  return out;
}

function parseIntakeProcesses(rows: Row[]): ProcessParsed[] {
  if (!rows.length) return [];
  const out: ProcessParsed[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const companyName = cellText(row[0]);
    if (!companyName) continue;
    const checklist: Record<string, boolean> = Object.fromEntries(
      CHECKLIST_KEYS.map(k => [k, false]),
    );
    CHECKLIST_KEYS.forEach((k, i) => {
      checklist[k] = parseBool(row[4 + i]);
    });
    out.push({
      excelKey: `process||${companyName}`,
      companyName,
      feeStartDate: excelDateSerial(row[1]),
      monthlyFee: typeof row[2] === 'number' ? (row[2] as number) : null,
      channel: cellText(row[3]),
      checklist,
    });
  }
  return out;
}

function parseChurnRows(rows: Row[]): ChurnParsed[] {
  if (!rows.length) return [];
  const out: ChurnParsed[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const companyName = cellText(row[0]);
    if (!companyName) continue;
    out.push({
      excelKey: `churn||${companyName}`,
      companyName,
      churnedAt: excelDateSerial(row[1]),
      feeAmount: typeof row[2] === 'number' ? (row[2] as number) : null,
      dataCleanup: cellText(row[3]),
      churnType: cellText(row[4]),
      earlySign: cellText(row[5]),
      reason: cellText(row[6]) || cellText(row[4]) || '기타',
      manager: cellText(row[7]),
      businessNo: cellText(row[9]),
      representative: cellText(row[10]),
    });
  }
  return out;
}

function companyKey(name: unknown): string {
  return String(name ?? '').trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** 유입관리 블루홀케이스 → 유입프로세스 블루홀 거래처 체크 자동 반영 */
function enrichProcessesWithInquiries(
  processes: ProcessParsed[],
  inquiries: InquiryParsed[],
): ProcessParsed[] {
  const inqByName = new Map<string, string>();
  for (const i of inquiries) {
    const code = String(i.extra?.blueholeCase ?? '').trim();
    if (!code) continue;
    const key = companyKey(i.companyName);
    if (key) inqByName.set(key, code);
  }

  return processes.map(p => {
    const code = inqByName.get(companyKey(p.companyName));
    if (!code) return p;
    return {
      ...p,
      checklist: { ...p.checklist, blueholeClient: true },
    };
  });
}

export function shouldSkipOperationalRow(row: {
  companyName?: string;
  representative?: string;
  businessNo?: string;
}): boolean {
  return isManagerNameOnlyRow({
    companyName: row.companyName,
    representative: row.representative ?? '',
    businessNo: row.businessNo ?? '',
  });
}

function sheetRows(wb: XLSX.WorkBook, name: string): Row[] {
  if (!wb.Sheets[name]) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as Row[];
}

/** 업로드된 워크북 버퍼에서 운영 데이터(유입·프로세스·유출)를 파싱한다. */
export function parseOperationalWorkbook(buffer: Buffer | ArrayBuffer): ParsedOperational {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const inquiryRows = sheetRows(wb, '유입관리');
  const processRows = sheetRows(wb, '유입프로세스');
  const churnRows = sheetRows(wb, '유출');

  const inquiries = parseIntakeInquiries(inquiryRows);
  const processes = enrichProcessesWithInquiries(parseIntakeProcesses(processRows), inquiries);
  const churns = parseChurnRows(churnRows);

  return {
    inquiries,
    processes,
    churns,
    sheets: {
      inquiries: inquiryRows.length > 0,
      processes: processRows.length > 0,
      churns: churnRows.length > 0,
    },
  };
}
