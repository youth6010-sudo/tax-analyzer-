import * as XLSX from 'xlsx';
import { formatArrearsPaidDateKo } from '@/app/types/arrears';
import {
  isTaxInvoiceIssuanceSheet,
  parseTaxInvoiceIssuanceWorkbook,
  taxInvoiceLineTotal,
} from '@/lib/taxInvoiceIssuanceParse';

export type ArrearsFeeEventKind = 'tax_invoice' | 'cms' | 'charge' | 'payment';

export type ParsedFeeEvent = {
  externalCode: string;
  companyName: string;
  /** 숫자만 사업자번호 */
  businessNo: string;
  kind: ArrearsFeeEventKind;
  description: string;
  amount: number;
  eventDate: string;
  /** amount로 올릴지 paidAmount로 올릴지 */
  isPayment: boolean;
  /** 엑셀 녹색(신규) 행 — CLI/특수 파서에서만 설정 */
  isNew?: boolean;
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellMoney(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(normHeader);
    const joined = cells.join('|');
    // CMS 출금내역
    if (joined.includes('회원명') && joined.includes('금액')) return i;
    if (joined.includes('출금일') && joined.includes('금액')) return i;
    // 입금/수납
    if (
      (joined.includes('입금') || joined.includes('수납') || joined.includes('입금자')) &&
      joined.includes('금액')
    ) {
      return i;
    }
    // 세금계산서 / 일반
    if (
      (joined.includes('상호') || joined.includes('거래처') || joined.includes('공급받는자') || joined.includes('코드')) &&
      (joined.includes('금액') || joined.includes('합계') || joined.includes('공급가액'))
    ) {
      return i;
    }
    // 구분+금액
    if (joined.includes('구분') && joined.includes('금액')) return i;
  }
  return -1;
}

function colIndex(headers: string[], ...cands: string[]): number {
  for (const c of cands) {
    const i = headers.findIndex(h => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** 빌프랑(30) → 빌프랑 */
export function stripCmsScheduleSuffix(name: string): string {
  return String(name || '')
    .replace(/\s*\(\d{1,2}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPaidDateLabel(isoOrRaw: string | number | Date): string {
  return formatArrearsPaidDateKo(isoOrRaw);
}

function detectKind(
  raw: string,
  hints: { isCmsLayout: boolean; isTaxLayout: boolean },
): ArrearsFeeEventKind {
  const s = raw.replace(/\s+/g, '').toLowerCase();
  if (/cms|씨엠에스/.test(s)) return 'cms';
  if (/세금계산서|계산서|세금/.test(s)) return 'tax_invoice';
  if (/입금|출금|수납|결제/.test(s)) return 'payment';
  if (/미수|청구|발급/.test(s)) return 'charge';
  if (hints.isCmsLayout) return 'cms';
  if (hints.isTaxLayout) return 'tax_invoice';
  return 'charge';
}

function kindDefaultDescription(kind: ArrearsFeeEventKind, eventDate: string): string {
  const d = formatPaidDateLabel(eventDate);
  switch (kind) {
    case 'cms':
      return d ? `CMS 입금 (${d})` : 'CMS 입금';
    case 'tax_invoice':
      return d ? `세금계산서 (${d})` : '세금계산서';
    case 'payment':
      return d ? `입금 (${d})` : '입금';
    default:
      return d ? `미수 추가 (${d})` : '미수 추가';
  }
}

/** CMS 출금내역 / 세금계산서 / 일반 이벤트 xls 파싱 */
export function parseArrearsFeeEventsWorkbook(
  buffer: ArrayBuffer | Buffer,
  filename = '',
): { events: ParsedFeeEvent[]; detected: 'cms' | 'tax' | 'generic' | 'tax_issuance' } {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('엑셀 시트가 없습니다.');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  // 국세청 대량발급 양식 — 품목별로 매출(청구) 라인
  if (isTaxInvoiceIssuanceSheet(rows)) {
    const lines = parseTaxInvoiceIssuanceWorkbook(buffer, filename);
    const events: ParsedFeeEvent[] = lines.map(line => ({
      externalCode: '',
      companyName: line.companyName,
      businessNo: line.businessNo,
      kind: 'tax_invoice' as const,
      description: line.itemName,
      amount: taxInvoiceLineTotal(line),
      eventDate: line.writeDate,
      isPayment: false,
      isNew: line.isNew || undefined,
    }));
    return { events, detected: 'tax_issuance' };
  }

  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) {
    throw new Error(
      '형식을 인식하지 못했습니다. (CMS/더빌: 회원명·금액·출금일 / 세금계산서: 상호·금액 / 입금: 입금·금액 / 일반: 구분·금액)',
    );
  }

  const headers = (rows[headerIdx] ?? []).map(normHeader);
  const fileHint = String(filename || '');
  const isCmsLayout =
    headers.some(h => h.includes('회원명')) ||
    (headers.some(h => h.includes('출금일')) && headers.some(h => h.includes('회원'))) ||
    /cms|씨엠에스|더빌|thebill/i.test(fileHint);
  const isTaxLayout =
    headers.some(h => h.includes('공급받는자') || h.includes('세금계산서')) ||
    /세금|etax|invoice|nta/i.test(fileHint);
  const isPaymentLayout =
    headers.some(h => h.includes('입금') || h.includes('수납') || h.includes('출금금액')) ||
    /입금|수납|payment|deposit/i.test(fileHint);

  const iCode = colIndex(headers, '코드', '거래처코드', '회원아이디', '회원id');
  const iName = colIndex(
    headers,
    '회원명',
    '공급받는자',
    '상호',
    '거래처명',
    '거래처',
    '회사명',
    '업체명',
    '예금주',
    '입금자',
  );
  const iBiz = colIndex(
    headers,
    '사업자번호',
    '사업자등록번호',
    '등록번호',
    '공급받는자등록번호',
    '사업자',
  );
  const iKind = colIndex(headers, '구분', '유형', '종류', '상태');
  const iDesc = colIndex(headers, '내역', '품목', '적요', '비고', '메모', '내용');
  const iAmt = colIndex(
    headers,
    '금액',
    '합계금액',
    '합계',
    '공급가액',
    '청구금액',
    '출금액',
    '입금액',
    '수납금액',
    '결제금액',
  );
  const iDate = colIndex(
    headers,
    '출금일',
    '입금일',
    '수납일',
    '작성일자',
    '일자',
    '지급일시',
    '발급일',
    '날짜',
    '기준일',
    '거래일',
  );

  if (iName < 0 && iCode < 0 && iBiz < 0) {
    throw new Error('상호/회원명, 코드 또는 사업자번호 열이 필요합니다.');
  }
  if (iAmt < 0) {
    throw new Error('금액 열이 필요합니다.');
  }

  const events: ParsedFeeEvent[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    let companyName = iName >= 0 ? cellStr(row[iName]) : '';
    if (isCmsLayout) companyName = stripCmsScheduleSuffix(companyName);
    const externalCode = iCode >= 0 ? cellStr(row[iCode]) : '';
    const businessNo = (iBiz >= 0 ? cellStr(row[iBiz]) : '').replace(/\D/g, '');
    if (!companyName && !externalCode && businessNo.length < 10) continue;
    if (/합계|총계|소계/.test(companyName)) continue;

    const amount = cellMoney(row[iAmt]);
    if (!amount) continue;

    const kindRaw = iKind >= 0 ? cellStr(row[iKind]) : '';
    let kind = detectKind(kindRaw, { isCmsLayout, isTaxLayout });
    if (kind === 'charge' && isPaymentLayout && !isTaxLayout) kind = 'payment';
    if (kind === 'charge' && isCmsLayout) kind = 'cms';
    const isPayment = kind === 'cms' || kind === 'payment';
    const eventDate = iDate >= 0 ? cellStr(row[iDate]) : '';
    let description = iDesc >= 0 ? cellStr(row[iDesc]) : '';
    if (!description) description = kindDefaultDescription(kind, eventDate);

    events.push({
      externalCode: /^\d{3,}$/.test(externalCode) ? externalCode : '',
      companyName,
      businessNo: businessNo.length >= 10 ? businessNo.slice(0, 10) : '',
      kind,
      description,
      amount: Math.abs(amount),
      eventDate,
      isPayment,
    });
  }

  const detected = isCmsLayout ? 'cms' : isTaxLayout ? 'tax' : isPaymentLayout ? 'generic' : 'generic';
  return { events, detected };
}

export function feeEventPaidDateLabel(eventDate: string | number | Date): string {
  return formatPaidDateLabel(eventDate);
}
