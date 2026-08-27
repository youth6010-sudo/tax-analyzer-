/**
 * 여러 업체 일괄 「미수 수수료 안내」 데이터
 */
import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines } from '@/db/schema';
import { formatArrearsChargeLabel } from '@/lib/arrearsLineLabel';

export type BatchInvoiceRow = {
  entryId: string;
  companyName: string;
  externalCode: string;
  managerName: string;
  amount: number;
  /** 비고 기본값 */
  remark: string;
  reasonSummary: string;
};

function monthLabelFromDesc(desc: string): string | null {
  const d = String(desc || '').replace(/\s+/g, '');
  // 26년 5월 / 2026년 05월
  const m1 = d.match(/(20)?(\d{2})년0?(\d{1,2})월/);
  if (m1) {
    const yy = m1[1] ? m1[1] + m1[2] : `20${m1[2]}`;
    const mon = m1[3].padStart(2, '0');
    return `${yy}.${mon}`;
  }
  return null;
}

function remarkFromDescriptions(descs: string[], fallback: string): string {
  const months: string[] = [];
  for (const d of descs) {
    const m = monthLabelFromDesc(d);
    if (m && !months.includes(m)) months.push(m);
  }
  months.sort();
  if (months.length >= 2) {
    const [aY, aM] = months[0]!.split('.');
    const [bY, bM] = months[months.length - 1]!.split('.');
    return `${aY}년 ${Number(aM)}월 ~ ${bY}년 ${Number(bM)}월`;
  }
  if (months.length === 1) {
    const [y, m] = months[0]!.split('.');
    return `${y}년 ${Number(m)}월`;
  }
  // 조정료 등이면 첫 청구 설명
  const charge = descs.find(d => Math.abs(d.length) > 0 && !/원장|전기이월|확인필요/.test(d));
  if (charge) return charge.slice(0, 80);
  return fallback.slice(0, 80);
}

export async function buildBatchInvoiceRows(entryIds: string[]): Promise<BatchInvoiceRow[]> {
  const ids = [...new Set(entryIds.map(id => id.trim()).filter(Boolean))];
  if (!ids.length) return [];

  const db = getDb();
  const entries = await db
    .select()
    .from(arrearsEntries)
    .where(inArray(arrearsEntries.id, ids));

  const byId = new Map(entries.map(e => [e.id, e]));
  const lines = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      description: arrearsLetterLines.description,
      amount: arrearsLetterLines.amount,
      sortOrder: arrearsLetterLines.sortOrder,
    })
    .from(arrearsLetterLines)
    .where(inArray(arrearsLetterLines.arrearsEntryId, ids));

  const descsByEntry = new Map<string, string[]>();
  const chargeDescsByEntry = new Map<string, string[]>();
  for (const l of lines) {
    const desc = (l.description || '').trim();
    if (!desc) continue;
    const all = descsByEntry.get(l.arrearsEntryId) ?? [];
    all.push(desc);
    descsByEntry.set(l.arrearsEntryId, all);
    if (Math.round(l.amount) > 0) {
      const ch = chargeDescsByEntry.get(l.arrearsEntryId) ?? [];
      if (ch.length < 3 && !ch.includes(desc)) ch.push(desc);
      chargeDescsByEntry.set(l.arrearsEntryId, ch);
    }
  }

  const rows: BatchInvoiceRow[] = [];
  for (const id of ids) {
    const e = byId.get(id);
    if (!e) continue;
    const charges = chargeDescsByEntry.get(id) ?? [];
    const asOf = e.letterDate || e.asOfDate;
    const formattedCharges = charges.map((desc, i) =>
      formatArrearsChargeLabel(desc, {
        asOfDate: asOf,
        prevDescription: i > 0 ? charges[i - 1] : undefined,
      }),
    );
    const reasonSummary =
      formattedCharges.join(' · ') || (e.memo || '').trim() || '—';
    const remark = remarkFromDescriptions(descsByEntry.get(id) ?? [], reasonSummary);
    rows.push({
      entryId: e.id,
      companyName: e.companyName,
      externalCode: e.externalCode,
      managerName: e.managerName,
      amount: Math.round(e.balance),
      remark,
      reasonSummary,
    });
  }
  return rows;
}

export function formatSubmitDateKo(d = new Date()): string {
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
}
