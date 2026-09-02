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

function parseSheetMeta(rows: unknown[][]): {
  externalCode: string;
  companyName: string;
  periodYear: number;
} | null {
  let externalCode = '';
  let companyName = '';
  let periodYear = new Date().getFullYear();

  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const row = rows[i] ?? [];
    for (const cell of row) {
      const s = cellStr(cell);
      const m = s.match(/\[(\d{3,})\]\s*(.+)/);
      if (m) {
        externalCode = m[1]!;
        companyName = m[2]!.trim();
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

function isSummaryDesc(desc: string): boolean {
  const d = desc.replace(/\s+/g, '');
  return (
    !d ||
    d.includes('전기이월') ||
    d.includes('월계') ||
    d.includes('누계') ||
    d.includes('분기계') ||
    d.includes('월       계') ||
    d.includes('누       계') ||
    d.includes('분   기  계')
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
): ParsedClientDetailTx[] {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
  const meta = parseSheetMeta(rows);
  if (!meta) return [];

  const txs: ParsedClientDetailTx[] = [];
  let lastDate = '';

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const dateRaw = cellStr(row[0]);
    const desc = cellStr(row[3]);
    const debit = cellMoney(row[5]);
    const credit = cellMoney(row[6]);

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
  }

  if (!txs.length && sheetName) {
    const m = sheetName.match(/^\((\d{3,})\)(.+)$/);
    if (m) {
      return txs;
    }
  }
  return txs;
}

export function parseArrearsClientDetailWorkbook(buffer: Buffer): ParsedClientDetailTx[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const all: ParsedClientDetailTx[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    all.push(...parseClientDetailSheet(sheet, sheetName));
  }
  return all;
}

/** 원장 적요 → 공문 형식 (2026년 7월, 26년 법인조정료 등) */
export function ledgerDescToLetterDescription(
  ledgerDesc: string,
  eventDate: string,
  existingLetterDescs: string[],
): string {
  const raw = ledgerDesc.trim();
  const d = raw.replace(/\s+/g, '');
  const year = Number(eventDate.slice(0, 4)) || new Date().getFullYear();
  const yy = year % 100;

  const monthFee = raw.match(/(\d{1,2})월\s*기장/);
  if (monthFee) {
    return `${year}년 ${Number(monthFee[1])}월`;
  }

  if (/법인/.test(d)) {
    const hasShort = existingLetterDescs.some(x => /^\d{2}년\s*법인/.test(x));
    return hasShort ? `${yy}년 법인조정료` : `${year}년 법인조정료`;
  }
  if (/성실/.test(d)) {
    const hasShort = existingLetterDescs.some(x => /^\d{2}년\s*성실/.test(x));
    return hasShort ? `${yy}년 성실신고수수료` : `${year}년 성실신고수수료`;
  }
  if (/개인조정/.test(d)) {
    const hasShort = existingLetterDescs.some(x => /^\d{2}년\s*개인/.test(x));
    return hasShort ? `${yy}년 개인조정료` : `${year}년 개인조정료`;
  }
  if (/부가세/.test(d)) {
    const m = raw.match(/(\d{1,2})월/);
    if (m) return `${year}년 ${Number(m[1])}월 부가세신고`;
    return `${year}년 부가세신고`;
  }
  if (/기타/.test(d)) {
    const m = raw.match(/(\d{1,2})월/);
    if (m) return `${year}년 기타수수료 ${Number(m[1])}월`;
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
  paidAmount: number;
  paidDate: string;
}): string {
  return `${line.description}|${line.amount}|${line.paidAmount}|${line.paidDate}`;
}
