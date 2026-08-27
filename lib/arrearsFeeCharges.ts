/**
 * 조정료 일괄 · 원장반영(전기이월) → 월 기장료 분해
 */
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines, clients } from '@/db/schema';
import { readFeeItems } from '@/app/utils/feeBreakdown';
import { normalizeBizNo } from '@/app/utils/filingCheck';
import {
  bookkeepingDescriptionForMonth,
  monthlyBookkeepingFeeFromIntake,
} from '@/lib/arrearsMonthlyBookkeeping';
import { isLedgerRefDescription } from '@/lib/arrearsMatchReview';
import { appendLetterLine, listLetterLines, replaceLetterLines } from '@/lib/arrearsLetterDb';

function normalizeCompanyName(name: string): string {
  return name.replace(/\s+/g, '').trim().toLowerCase();
}

export function adjustmentFeeFromIntake(
  intakeData: Record<string, unknown> | null | undefined,
): number {
  const items = readFeeItems(intakeData || undefined);
  let sum = 0;
  for (const item of items) {
    if (item.itemName.trim() === '조정료') {
      sum += Math.round(item.supplyAmount || 0);
    }
  }
  return sum > 0 ? sum : 0;
}

/** 2026 → 2026년 조정료 */
export function adjustmentDescriptionForYear(year: number): string {
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error('year는 2000~2100 사이여야 합니다.');
  }
  return `${year}년 조정료`;
}

function parseYear(raw: string | undefined): number {
  if (raw?.trim()) {
    const y = Number(raw.trim());
    if (!Number.isFinite(y)) throw new Error('year는 YYYY 형식이어야 합니다.');
    return y;
  }
  return new Date().getFullYear();
}

type MatchedClient = {
  id: string;
  companyName: string;
  manager: string;
  intakeData: unknown;
};

async function loadMatchMaps() {
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

  const matchEntry = (c: MatchedClient & { businessNo?: string }) => {
    if (byClientId.has(c.id)) return byClientId.get(c.id)!;
    const biz = normalizeBizNo(c.businessNo || '');
    if (biz.length === 10 && byBiz.has(biz)) return byBiz.get(biz)!;
    const nk = normalizeCompanyName(c.companyName || '');
    if (nk && byName.has(nk)) return byName.get(nk)!;
    return null;
  };

  const clientById = new Map(clientRows.map(c => [c.id, c]));
  const clientByBiz = new Map<string, (typeof clientRows)[0]>();
  const clientByName = new Map<string, (typeof clientRows)[0]>();
  for (const c of clientRows) {
    const biz = normalizeBizNo(c.businessNo || '');
    if (biz.length === 10 && !clientByBiz.has(biz)) clientByBiz.set(biz, c);
    const nk = normalizeCompanyName(c.companyName || '');
    if (nk && !clientByName.has(nk)) clientByName.set(nk, c);
  }

  const matchClient = (entry: (typeof arrearsRows)[0]) => {
    if (entry.clientId && clientById.has(entry.clientId)) return clientById.get(entry.clientId)!;
    const biz = normalizeBizNo(entry.businessNo || '');
    if (biz.length === 10 && clientByBiz.has(biz)) return clientByBiz.get(biz)!;
    const nk = normalizeCompanyName(entry.companyName || '');
    if (nk && clientByName.has(nk)) return clientByName.get(nk)!;
    return null;
  };

  return { clientRows, matchEntry, matchClient };
}

export type BulkAdjustmentRow = {
  clientId: string;
  clientName: string;
  manager: string;
  fee: number;
  entryId: string | null;
  externalCode: string | null;
  description: string;
  status: 'ready' | 'skip_no_entry' | 'skip_no_fee' | 'skip_duplicate';
  statusLabel: string;
};

export async function previewAdjustmentBulk(opts?: {
  year?: string | number;
  manager?: string;
}): Promise<{
  year: number;
  description: string;
  managerFilter: string;
  totalClients: number;
  ready: number;
  readyAmount: number;
  skipped: number;
  rows: BulkAdjustmentRow[];
}> {
  const year = typeof opts?.year === 'number' ? opts.year : parseYear(opts?.year?.toString());
  const description = adjustmentDescriptionForYear(year);
  const managerFilter = (opts?.manager || '').trim();
  const { clientRows, matchEntry } = await loadMatchMaps();
  const db = getDb();

  const existing = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
    })
    .from(arrearsLetterLines)
    .where(
      and(eq(arrearsLetterLines.description, description), ne(arrearsLetterLines.amount, 0)),
    );
  const dupSet = new Set(existing.map(l => l.arrearsEntryId));

  const rows: BulkAdjustmentRow[] = [];
  for (const c of clientRows) {
    if (managerFilter && (c.manager || '').trim() !== managerFilter) continue;
    const fee = adjustmentFeeFromIntake((c.intakeData || {}) as Record<string, unknown>);
    const entry = matchEntry(c);

    if (fee <= 0) {
      rows.push({
        clientId: c.id,
        clientName: c.companyName,
        manager: (c.manager || '').trim(),
        fee: 0,
        entryId: entry?.id ?? null,
        externalCode: entry?.externalCode ?? null,
        description,
        status: 'skip_no_fee',
        statusLabel: '조정료 없음',
      });
      continue;
    }
    if (!entry) {
      rows.push({
        clientId: c.id,
        clientName: c.companyName,
        manager: (c.manager || '').trim(),
        fee,
        entryId: null,
        externalCode: null,
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
        fee,
        entryId: entry.id,
        externalCode: entry.externalCode,
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
      fee,
      entryId: entry.id,
      externalCode: entry.externalCode,
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
    year,
    description,
    managerFilter,
    totalClients: rows.length,
    ready: readyRows.length,
    readyAmount: readyRows.reduce((s, r) => s + r.fee, 0),
    skipped: rows.length - readyRows.length,
    rows,
  };
}

export async function applyAdjustmentBulk(
  opts: { year?: string | number; manager?: string },
  actorName: string,
): Promise<{
  applied: number;
  appliedAmount: number;
  failed: number;
  description: string;
  year: number;
}> {
  const preview = await previewAdjustmentBulk(opts);
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
          amount: row.fee,
          paidAmount: 0,
          paidDate: '',
          source: 'manual',
        },
        { syncBalance: true },
      );
      applied += 1;
      appliedAmount += row.fee;
    } catch {
      failed += 1;
    }
  }

  return {
    applied,
    appliedAmount,
    failed,
    description: preview.description,
    year: preview.year,
  };
}

function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error('endYearMonth는 YYYY-MM 형식이어야 합니다.');
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function proposeMonthlyBackfillLines(opts: {
  balance: number;
  monthlyFee: number;
  endYearMonth: string;
}): {
  lines: Array<{ yearMonth: string; description: string; amount: number }>;
  remainder: number;
  covered: number;
} {
  const fee = Math.round(opts.monthlyFee);
  const bal = Math.round(opts.balance);
  if (fee <= 0 || bal <= 0) {
    return { lines: [], remainder: Math.max(bal, 0), covered: 0 };
  }
  const months = Math.floor(bal / fee);
  const lines: Array<{ yearMonth: string; description: string; amount: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = shiftYearMonth(opts.endYearMonth, -i);
    lines.push({
      yearMonth: ym,
      description: bookkeepingDescriptionForMonth(ym),
      amount: fee,
    });
  }
  const covered = months * fee;
  return { lines, remainder: bal - covered, covered };
}

export type LedgerBackfillRow = {
  entryId: string;
  companyName: string;
  externalCode: string;
  managerName: string;
  balance: number;
  monthlyFee: number;
  clientName: string | null;
  monthCount: number;
  covered: number;
  remainder: number;
  endYearMonth: string;
  proposedDescriptions: string[];
  status: 'ready' | 'skip_no_fee' | 'skip_has_detail' | 'skip_zero' | 'skip_no_client';
  statusLabel: string;
};

function endYearMonthFromEntry(asOfDate: string): string {
  const raw = (asOfDate || '').trim().replace(/\./g, '-');
  const m = /^(\d{4})-(\d{2})/.exec(raw);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function previewLedgerBackfill(opts?: {
  manager?: string;
  endYearMonth?: string;
}): Promise<{
  managerFilter: string;
  endYearMonthOverride: string;
  ready: number;
  readyAmount: number;
  skipped: number;
  rows: LedgerBackfillRow[];
}> {
  const managerFilter = (opts?.manager || '').trim();
  const endYearMonthOverride = (opts?.endYearMonth || '').trim();
  const { matchClient } = await loadMatchMaps();
  const db = getDb();
  const entries = await db.select().from(arrearsEntries);
  const allLines = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      description: arrearsLetterLines.description,
      source: arrearsLetterLines.source,
    })
    .from(arrearsLetterLines);

  const linesByEntry = new Map<string, typeof allLines>();
  for (const l of allLines) {
    const list = linesByEntry.get(l.arrearsEntryId) ?? [];
    list.push(l);
    linesByEntry.set(l.arrearsEntryId, list);
  }

  const rows: LedgerBackfillRow[] = [];
  for (const e of entries) {
    if (managerFilter && (e.managerName || '').trim() !== managerFilter) continue;
    const lines = linesByEntry.get(e.id) ?? [];
    const balance = Math.round(e.balance);
    const endYearMonth = endYearMonthOverride || endYearMonthFromEntry(e.asOfDate || '');

    if (balance <= 0) {
      rows.push({
        entryId: e.id,
        companyName: e.companyName,
        externalCode: e.externalCode,
        managerName: e.managerName,
        balance,
        monthlyFee: 0,
        clientName: null,
        monthCount: 0,
        covered: 0,
        remainder: 0,
        endYearMonth,
        proposedDescriptions: [],
        status: 'skip_zero',
        statusLabel: '잔액 없음',
      });
      continue;
    }

    const hasDetail =
      lines.length > 0 && lines.some(l => !isLedgerRefDescription(l.description, l.source));
    if (hasDetail) {
      rows.push({
        entryId: e.id,
        companyName: e.companyName,
        externalCode: e.externalCode,
        managerName: e.managerName,
        balance,
        monthlyFee: 0,
        clientName: null,
        monthCount: 0,
        covered: 0,
        remainder: 0,
        endYearMonth,
        proposedDescriptions: [],
        status: 'skip_has_detail',
        statusLabel: '공문 상세 있음',
      });
      continue;
    }

    const client = matchClient(e);
    if (!client) {
      rows.push({
        entryId: e.id,
        companyName: e.companyName,
        externalCode: e.externalCode,
        managerName: e.managerName,
        balance,
        monthlyFee: 0,
        clientName: null,
        monthCount: 0,
        covered: 0,
        remainder: balance,
        endYearMonth,
        proposedDescriptions: [],
        status: 'skip_no_client',
        statusLabel: '수임처 연결 없음',
      });
      continue;
    }

    const monthlyFee = monthlyBookkeepingFeeFromIntake(
      (client.intakeData || {}) as Record<string, unknown>,
    );
    if (monthlyFee <= 0) {
      rows.push({
        entryId: e.id,
        companyName: e.companyName,
        externalCode: e.externalCode,
        managerName: e.managerName,
        balance,
        monthlyFee: 0,
        clientName: client.companyName,
        monthCount: 0,
        covered: 0,
        remainder: balance,
        endYearMonth,
        proposedDescriptions: [],
        status: 'skip_no_fee',
        statusLabel: '기장수수료 없음',
      });
      continue;
    }

    const proposed = proposeMonthlyBackfillLines({
      balance,
      monthlyFee,
      endYearMonth,
    });
    if (!proposed.lines.length) {
      rows.push({
        entryId: e.id,
        companyName: e.companyName,
        externalCode: e.externalCode,
        managerName: e.managerName,
        balance,
        monthlyFee,
        clientName: client.companyName,
        monthCount: 0,
        covered: 0,
        remainder: balance,
        endYearMonth,
        proposedDescriptions: [],
        status: 'skip_no_fee',
        statusLabel: '1개월분 미만',
      });
      continue;
    }

    const descs = proposed.lines.map(l => l.description);
    if (proposed.remainder > 0) {
      descs.push(`확인필요 잔액차 (${proposed.remainder.toLocaleString('ko-KR')}원)`);
    }

    rows.push({
      entryId: e.id,
      companyName: e.companyName,
      externalCode: e.externalCode,
      managerName: e.managerName,
      balance,
      monthlyFee,
      clientName: client.companyName,
      monthCount: proposed.lines.length,
      covered: proposed.covered,
      remainder: proposed.remainder,
      endYearMonth,
      proposedDescriptions: descs,
      status: 'ready',
      statusLabel:
        proposed.remainder > 0
          ? `${proposed.lines.length}개월 + 잔액차`
          : `${proposed.lines.length}개월`,
    });
  }

  rows.sort((a, b) => {
    if (a.status === 'ready' && b.status !== 'ready') return -1;
    if (a.status !== 'ready' && b.status === 'ready') return 1;
    return b.balance - a.balance;
  });

  const readyRows = rows.filter(r => r.status === 'ready');
  return {
    managerFilter,
    endYearMonthOverride,
    ready: readyRows.length,
    readyAmount: readyRows.reduce((s, r) => s + r.covered, 0),
    skipped: rows.length - readyRows.length,
    rows,
  };
}

export async function applyLedgerBackfill(
  opts: {
    manager?: string;
    endYearMonth?: string;
    entryIds?: string[];
  },
  actorName: string,
): Promise<{ applied: number; failed: number; skipped: number }> {
  const preview = await previewLedgerBackfill(opts);
  const allow = opts.entryIds?.length ? new Set(opts.entryIds) : null;
  let applied = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of preview.rows) {
    if (row.status !== 'ready') continue;
    if (allow && !allow.has(row.entryId)) {
      skipped += 1;
      continue;
    }
    try {
      const proposed = proposeMonthlyBackfillLines({
        balance: row.balance,
        monthlyFee: row.monthlyFee,
        endYearMonth: row.endYearMonth,
      });
      const inputs = proposed.lines.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: 0,
        paidDate: '',
        source: 'manual' as const,
      }));
      if (proposed.remainder > 0) {
        inputs.push({
          description: `확인필요 잔액차 (${row.endYearMonth})`,
          amount: proposed.remainder,
          paidAmount: 0,
          paidDate: '',
          source: 'manual' as const,
        });
      }

      // 원장 잔액은 유지 — 줄만 사유로 갈아끼움
      await replaceLetterLines(row.entryId, actorName, inputs, { syncBalance: false });

      // 안전장치: 줄 합 = 잔액
      const after = await listLetterLines(row.entryId);
      const sum = after.reduce((s, l) => s + l.amount - l.paidAmount, 0);
      if (sum !== row.balance) {
        throw new Error(`잔액 불일치: 줄합 ${sum} ≠ 원장 ${row.balance}`);
      }
      applied += 1;
    } catch {
      failed += 1;
    }
  }

  return { applied, failed, skipped };
}
