import * as XLSX from 'xlsx';
import type { ArrearsLetterLineSource } from '@/app/types/arrears';
import { formatArrearsPaidDateKo } from '@/app/types/arrears';

export type ParsedClientDetailTx = {
  externalCode: string;
  companyName: string;
  eventDate: string;
  ledgerDescription: string;
  debit: number;
  credit: number;
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellMoney(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseSheetMeta(
  rows: unknown[][],
  sheetName: string,
): {
  externalCode: string;
  companyName: string;
  periodYear: number;
} | null {
  let externalCode = '';
  let companyName = '';
  let periodYear = new Date().getFullYear();

  // 시트명 `(00180)아이스테이션` — 코드별 시트 각각 적용 (셀 메타보다 우선)
  const fromName = sheetName.match(/^\((\d{3,})\)\s*(.+)$/);
  if (fromName) {
    externalCode = fromName[1]!;
    companyName = fromName[2]!.trim();
  }

  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const row = rows[i] ?? [];
    for (const cell of row) {
      const s = cellStr(cell);
      const m = s.match(/\[(\d{3,})\]\s*(.+)/);
      if (m) {
        if (!externalCode) {
          externalCode = m[1]!;
          companyName = m[2]!.trim();
        } else if (externalCode === m[1]) {
          companyName = m[2]!.trim();
        }
        // 시트명 코드와 셀 코드가 다르면 시트명(코드별 시트) 유지
      }
      const m2 = s.match(/^(\d{4})\.\d{2}\.\d{2}\s*~\s*(\d{4})/);
      if (m2) periodYear = Number(m2[2]) || Number(m2[1]) || periodYear;
    }
  }

  const sn = rows[3]?.[7] ? cellStr(rows[3][7]) : '';
  const m3 = sn.match(/^\((\d{3,})\)(.+)$/);
  if (m3 && !externalCode) {
    externalCode = m3[1]!;
    companyName = m3[2]!.trim();
  }

  if (!externalCode) return null;
  return { externalCode, companyName, periodYear };
}

/** 월계·누계·전기이월만 스킵. 적요 빈 입금(8월 등)은 포함 */
function isSummaryDesc(desc: string): boolean {
  const d = desc.replace(/\s+/g, '');
  if (!d) return false;
  return (
    d.includes('전기이월') ||
    d.includes('[전기이월]') ||
    d.includes('월계') ||
    d.includes('누계') ||
    d.includes('분기계') ||
    /월\s*계/.test(desc) ||
    /누\s*계/.test(desc) ||
    /분\s*기\s*계/.test(desc)
  );
}

function parseMdDate(md: string, year: number): string {
  const m = md.match(/^(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${year}-${m[1]}-${m[2]}`;
}

function parseClientDetailSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
): { txs: ParsedClientDetailTx[]; endingBalance: number | null; externalCode: string } {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
  const meta = parseSheetMeta(rows, sheetName);
  if (!meta) {
    return { txs: [], endingBalance: null, externalCode: '' };
  }

  const txs: ParsedClientDetailTx[] = [];
  let lastDate = '';
  let endingBalance: number | null = null;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const dateRaw = cellStr(row[0]);
    const desc = cellStr(row[3]);
    const debit = cellMoney(row[5]);
    const credit = cellMoney(row[6]);
    const balCell = row[7];
    const hasBal =
      balCell != null &&
      balCell !== '' &&
      Number.isFinite(typeof balCell === 'number' ? balCell : Number(String(balCell).replace(/,/g, '')));

    if (dateRaw && /^\d{2}-\d{2}$/.test(dateRaw)) {
      lastDate = parseMdDate(dateRaw, meta.periodYear);
    }
    if (!lastDate || isSummaryDesc(desc)) continue;
    if (debit <= 0 && credit <= 0) continue;

    txs.push({
      externalCode: meta.externalCode,
      companyName: meta.companyName,
      eventDate: lastDate,
      ledgerDescription: desc,
      debit,
      credit,
    });
    if (hasBal) endingBalance = cellMoney(balCell);
  }

  return { txs, endingBalance, externalCode: meta.externalCode };
}

export function parseArrearsClientDetailWorkbook(buffer: Buffer): ParsedClientDetailTx[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const all: ParsedClientDetailTx[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    all.push(...parseClientDetailSheet(sheet, sheetName).txs);
  }
  return all;
}

/** 시트별 말잔 (거래처 코드 → 잔액) */
export function parseArrearsClientDetailEndings(buffer: Buffer): Record<string, number> {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const out: Record<string, number> = {};
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const { endingBalance, externalCode } = parseClientDetailSheet(sheet, sheetName);
    if (externalCode && endingBalance != null) {
      out[externalCode] = endingBalance;
    }
  }
  return out;
}

/** 공문 관례: `26년 7월` (기존에 네 자리가 있어도 신규는 짧은 연도) */
function preferShortYear(_existingLetterDescs: string[]): boolean {
  return true;
}

function yearLabel(year: number, short: boolean): string {
  return short ? `${year % 100}년` : `${year}년`;
}

/** 원장 적요 → 공문 형식 (`26년 7월`, `26년 법인조정료` 등) */
export function ledgerDescToLetterDescription(
  ledgerDesc: string,
  eventDate: string,
  existingLetterDescs: string[],
): string {
  const raw = ledgerDesc.trim();
  const d = raw.replace(/\s+/g, '');
  const year = Number(eventDate.slice(0, 4)) || new Date().getFullYear();
  const short = preferShortYear(existingLetterDescs);
  const y = yearLabel(year, short);

  const monthFee = raw.match(/(\d{1,2})월\s*기장/);
  if (monthFee) {
    return `${y} ${Number(monthFee[1])}월`;
  }

  if (/법인/.test(d)) {
    return `${y} 법인조정료`;
  }
  if (/성실/.test(d)) {
    return `${y} 성실신고수수료`;
  }
  if (/개인조정/.test(d)) {
    return `${y} 개인조정료`;
  }
  if (/부가세/.test(d)) {
    const m = raw.match(/(\d{1,2})월/);
    if (m) return `${y} ${Number(m[1])}월 부가세신고`;
    return `${y} 부가세신고`;
  }
  if (/기타/.test(d)) {
    const m = raw.match(/(\d{1,2})월/);
    if (m) return `${y} 기타수수료 ${Number(m[1])}월`;
  }

  return raw;
}

export function clientDetailTxToLineInput(
  tx: ParsedClientDetailTx,
  existingLetterDescs: string[],
): {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  source: ArrearsLetterLineSource;
} | null {
  if (tx.debit > 0) {
    const description = ledgerDescToLetterDescription(
      tx.ledgerDescription,
      tx.eventDate,
      existingLetterDescs,
    );
    if (!description || /전기이월/.test(description.replace(/\s+/g, ''))) return null;
    return {
      description,
      amount: tx.debit,
      paidAmount: 0,
      paidDate: '',
      source: 'ledger',
    };
  }
  if (tx.credit > 0) {
    const paidDate = formatArrearsPaidDateKo(
      `${Number(tx.eventDate.slice(5, 7))}월 ${Number(tx.eventDate.slice(8, 10))}일`,
    );
    return {
      description: tx.ledgerDescription.trim() || '입금',
      amount: 0,
      paidAmount: tx.credit,
      paidDate,
      source: 'payment',
    };
  }
  return null;
}

export function lineDedupKey(line: {
  description: string;
  amount: number;
  paidAmount?: number;
  paidDate?: string;
}): string {
  return `${line.description}|${Math.round(line.amount)}|${Math.round(line.paidAmount || 0)}|${String(line.paidDate || '').trim()}`;
}
