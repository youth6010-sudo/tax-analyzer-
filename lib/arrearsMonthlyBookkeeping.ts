/**
 * 수임처 기장수수료(월 공급가) → 미수 내역 일괄 청구
 */
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines, clients } from '@/db/schema';
import { readFeeItems } from '@/app/utils/feeBreakdown';
import { appendLetterLine } from '@/lib/arrearsLetterDb';
import { normalizeBizNo } from '@/app/utils/filingCheck';

export type BulkBookkeepingRow = {
  clientId: string;
  clientName: string;
  manager: string;
  monthlyFee: number;
  entryId: string | null;
  externalCode: string | null;
  entryCompanyName: string | null;
  currentBalance: number | null;
  description: string;
  status: 'ready' | 'skip_no_entry' | 'skip_no_fee' | 'skip_duplicate';
  statusLabel: string;
};

export type BulkBookkeepingPreview = {
  yearMonth: string;
  description: string;
  managerFilter: string;
  totalClients: number;
  ready: number;
  readyAmount: number;
  skipped: number;
  rows: BulkBookkeepingRow[];
};

function normalizeCompanyName(name: string): string {
  return name.replace(/\s+/g, '').trim().toLowerCase();
}

/** 2026-08 → 2026년 8월 기장료 */
export function bookkeepingDescriptionForMonth(yearMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!m) throw new Error('yearMonth는 YYYY-MM 형식이어야 합니다.');
  const year = m[1];
  const month = String(Number(m[2]));
  return `${year}년 ${month}월 기장료`;
}

export function monthlyBookkeepingFeeFromIntake(
  intakeData: Record<string, unknown> | null | undefined,
): number {
  const items = readFeeItems(intakeData || undefined);
  let sum = 0;
  for (const item of items) {
    if (item.itemName.trim() === '기장수수료') {
      sum += Math.round(item.supplyAmount || 0);
    }
  }
  return sum > 0 ? sum : 0;
}

function parseYearMonth(raw: string | undefined): string {
  if (raw?.trim()) {
    const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
    if (!m) throw new Error('yearMonth는 YYYY-MM 형식이어야 합니다.');
    return `${m[1]}-${m[2]}`;
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function previewMonthlyBookkeeping(opts?: {
  yearMonth?: string;
  manager?: string;
}): Promise<BulkBookkeepingPreview> {
  const yearMonth = parseYearMonth(opts?.yearMonth);
  const description = bookkeepingDescriptionForMonth(yearMonth);
  const managerFilter = (opts?.manager || '').trim();

  const db = getDb();
  const clientRows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      businessNo: clients.businessNo,
      manager: clients.manager,
      intakeData: clients.intakeData,
    })
    .from(clients)
    .where(ne(clients.status, 'churned'));

  const arrearsRows = await db.select().from(arrearsEntries);
  const byClientId = new Map<string, (typeof arrearsRows)[0]>();
  const byBiz = new Map<string, (typeof arrearsRows)[0]>();
  const byName = new Map<string, (typeof arrearsRows)[0]>();
  for (const row of arrearsRows) {
    if (row.clientId && !byClientId.has(row.clientId)) byClientId.set(row.clientId, row);
    const biz = normalizeBizNo(row.businessNo || '');
    if (biz.length === 10 && !byBiz.has(biz)) byBiz.set(biz, row);
    const nk = normalizeCompanyName(row.companyName || '');
    if (nk && !byName.has(nk)) byName.set(nk, row);
  }

  const matchEntry = (c: (typeof clientRows)[0]) => {
    if (byClientId.has(c.id)) return byClientId.get(c.id)!;
    const biz = normalizeBizNo(c.businessNo || '');
    if (biz.length === 10 && byBiz.has(biz)) return byBiz.get(biz)!;
    const nk = normalizeCompanyName(c.companyName || '');
    if (nk && byName.has(nk)) return byName.get(nk)!;
    return null;
  };

  const existingChargeLines = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      amount: arrearsLetterLines.amount,
    })
    .from(arrearsLetterLines)
    .where(
      and(eq(arrearsLetterLines.description, description), ne(arrearsLetterLines.amount, 0)),
    );
  const dupSet = new Set(existingChargeLines.map(l => l.arrearsEntryId));

  const rows: BulkBookkeepingRow[] = [];
  for (const c of clientRows) {
    if (managerFilter && (c.manager || '').trim() !== managerFilter) continue;

    const monthlyFee = monthlyBookkeepingFeeFromIntake(
      (c.intakeData || {}) as Record<string, unknown>,
    );
    const entry = matchEntry(c);

    if (monthlyFee <= 0) {
      rows.push({
        clientId: c.id,
        clientName: c.companyName,
        manager: (c.manager || '').trim(),
        monthlyFee: 0,
        entryId: entry?.id ?? null,
        externalCode: entry?.externalCode ?? null,
        entryCompanyName: entry?.companyName ?? null,
        currentBalance: entry?.balance ?? null,
        description,
        status: 'skip_no_fee',
        statusLabel: '기장수수료 없음',
      });
      continue;
    }

    if (!entry) {
      rows.push({
        clientId: c.id,
        clientName: c.companyName,
        manager: (c.manager || '').trim(),
        monthlyFee,
        entryId: null,
        externalCode: null,
        entryCompanyName: null,
        currentBalance: null,
        description,
        status: 'skip_no_entry',
        statusLabel: '미수 행 없음',
      });
      continue;
    }

    if (dupSet.has(entry.id)) {
      rows.push({
        clientId: c.id,
        clientName: c.companyName,
        manager: (c.manager || '').trim(),
        monthlyFee,
        entryId: entry.id,
        externalCode: entry.externalCode,
        entryCompanyName: entry.companyName,
        currentBalance: entry.balance,
        description,
        status: 'skip_duplicate',
        statusLabel: '이미 반영됨',
      });
      continue;
    }

    rows.push({
      clientId: c.id,
      clientName: c.companyName,
      manager: (c.manager || '').trim(),
      monthlyFee,
      entryId: entry.id,
      externalCode: entry.externalCode,
      entryCompanyName: entry.companyName,
      currentBalance: entry.balance,
      description,
      status: 'ready',
      statusLabel: '반영 예정',
    });
  }

  rows.sort((a, b) => {
    if (a.status === 'ready' && b.status !== 'ready') return -1;
    if (a.status !== 'ready' && b.status === 'ready') return 1;
    return a.clientName.localeCompare(b.clientName, 'ko');
  });

  const readyRows = rows.filter(r => r.status === 'ready');
  return {
    yearMonth,
    description,
    managerFilter,
    totalClients: rows.length,
    ready: readyRows.length,
    readyAmount: readyRows.reduce((s, r) => s + r.monthlyFee, 0),
    skipped: rows.length - readyRows.length,
    rows,
  };
}

export async function applyMonthlyBookkeeping(
  opts: { yearMonth?: string; manager?: string },
  actorName: string,
): Promise<{
  applied: number;
  appliedAmount: number;
  failed: number;
  description: string;
  yearMonth: string;
}> {
  const preview = await previewMonthlyBookkeeping(opts);
  let applied = 0;
  let appliedAmount = 0;
  let failed = 0;

  for (const row of preview.rows) {
    if (row.status !== 'ready' || !row.entryId) continue;
    try {
      await appendLetterLine(
        row.entryId,
        actorName,
        {
          description: row.description,
          amount: row.monthlyFee,
          paidAmount: 0,
          paidDate: '',
          source: 'manual',
        },
        { syncBalance: true },
      );
      applied += 1;
      appliedAmount += row.monthlyFee;
    } catch {
      failed += 1;
    }
  }

  return {
    applied,
    appliedAmount,
    failed,
    description: preview.description,
    yearMonth: preview.yearMonth,
  };
}
