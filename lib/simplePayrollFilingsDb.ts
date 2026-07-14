import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { simplePayrollFilings } from '@/db/schema';
import type { IncomeTypeKey } from '@/app/types/incomeTypes';
import { simplePayrollPeriodKeysForYear, prevSimplePayrollCarryPeriodKeys } from '@/lib/periodUtils';

/** 연말정산과 공유하는 간이지급 소득유형 */
const YEAR_END_SHARED_SIMPLE_TYPES = new Set<IncomeTypeKey>(['employed', 'bizIncome', 'otherTax']);

export type SimplePayrollRow = {
  periodKey?: string;
  clientId: string;
  incomeType: IncomeTypeKey;
  filed: boolean;
  acceptanceDate: string;
  acceptanceMethod: string;
  notes: string;
};

export async function listSimplePayrollFilingsByKeys(
  periodKeys: string[],
  clientIds?: string[],
): Promise<SimplePayrollRow[]> {
  if (periodKeys.length === 0) return [];
  const db = getDb();
  const conds = [inArray(simplePayrollFilings.periodKey, periodKeys)];
  if (clientIds && clientIds.length > 0) {
    conds.push(inArray(simplePayrollFilings.clientId, clientIds));
  }
  const rows = await db
    .select()
    .from(simplePayrollFilings)
    .where(and(...conds));

  return rows.map(r => ({
    periodKey: r.periodKey,
    clientId: r.clientId,
    incomeType: r.incomeType as IncomeTypeKey,
    filed: r.filed,
    acceptanceDate: r.acceptanceDate,
    acceptanceMethod: r.acceptanceMethod,
    notes: r.notes,
  }));
}

export async function listSimplePayrollFilings(
  periodKey: string,
  clientIds?: string[],
): Promise<SimplePayrollRow[]> {
  const db = getDb();
  const conds = [eq(simplePayrollFilings.periodKey, periodKey)];
  if (clientIds && clientIds.length > 0) {
    conds.push(inArray(simplePayrollFilings.clientId, clientIds));
  }
  const rows = await db
    .select()
    .from(simplePayrollFilings)
    .where(and(...conds));

  return rows.map(r => ({
    periodKey: r.periodKey,
    clientId: r.clientId,
    incomeType: r.incomeType as IncomeTypeKey,
    filed: r.filed,
    acceptanceDate: r.acceptanceDate,
    acceptanceMethod: r.acceptanceMethod,
    notes: r.notes,
  }));
}

/** 전월·직전 반기 접수 완료 키 — `clientId|incomeType` */
export async function listSimplePayrollPrevFiledKeys(
  year: number,
  month: number,
): Promise<Set<string>> {
  const { monthly, employed } = prevSimplePayrollCarryPeriodKeys(year, month);
  const keys = [monthly, employed].filter((k): k is string => !!k);
  if (keys.length === 0) return new Set();
  const rows = await listSimplePayrollFilingsByKeys(keys);
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.filed) continue;
    out.add(`${r.clientId}|${r.incomeType}`);
  }
  return out;
}

export async function upsertSimplePayrollFilings(
  periodKey: string,
  rows: SimplePayrollRow[],
  updatedBy: string,
): Promise<void> {
  const db = getDb();
  for (const row of rows) {
    const existing = await db
      .select()
      .from(simplePayrollFilings)
      .where(
        and(
          eq(simplePayrollFilings.clientId, row.clientId),
          eq(simplePayrollFilings.periodKey, periodKey),
          eq(simplePayrollFilings.incomeType, row.incomeType),
        ),
      )
      .limit(1);

    // 월 비활성 저장이더라도 기존 접수완료(filed)는 절대 false로 덮지 않음
    const keepFiled =
      !!existing[0]?.filed && String(row.notes || '').includes('__inactive__');
    const nextFiled = keepFiled ? true : row.filed;
    const nextDate = keepFiled
      ? row.acceptanceDate || existing[0]!.acceptanceDate
      : row.acceptanceDate;
    const nextMethod = keepFiled
      ? row.acceptanceMethod || existing[0]!.acceptanceMethod
      : row.acceptanceMethod;

    if (existing[0]) {
      await db
        .update(simplePayrollFilings)
        .set({
          filed: nextFiled,
          acceptanceDate: nextDate,
          acceptanceMethod: nextMethod,
          notes: row.notes,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(simplePayrollFilings.id, existing[0].id));
    } else {
      await db.insert(simplePayrollFilings).values({
        clientId: row.clientId,
        periodKey,
        incomeType: row.incomeType,
        filed: nextFiled,
        acceptanceDate: nextDate,
        acceptanceMethod: nextMethod,
        notes: row.notes,
        updatedBy,
      });
    }
  }
}

/** 엑셀 접수 — 접수목록 소득유형 ∩ 활성 유형만 filed=true (laborContentReport 제외) */
export type MatchSimplePayrollResult = {
  checkedCells: number;
  skippedInactive: number;
};

export async function matchSimplePayrollFromExcel(
  periodKey: string,
  filingTypes: Map<string, Set<IncomeTypeKey>>,
  clientBizMap: Map<string, string>,
  clientIncomeTypes: Map<string, IncomeTypeKey[]>,
  updatedBy: string,
): Promise<MatchSimplePayrollResult> {
  let checkedCells = 0;
  let skippedInactive = 0;
  const rows: SimplePayrollRow[] = [];

  for (const [clientId, biz] of clientBizMap) {
    const norm = biz.replace(/\D/g, '');
    if (norm.length !== 10) continue;
    const receiptTypes = filingTypes.get(norm);
    if (!receiptTypes || receiptTypes.size === 0) continue;

    const activeTypes = new Set(clientIncomeTypes.get(clientId) ?? []);

    for (const incomeType of receiptTypes) {
      if (incomeType === 'laborContentReport') continue;
      if (!activeTypes.has(incomeType)) {
        skippedInactive += 1;
        continue;
      }
      rows.push({
        periodKey,
        clientId,
        incomeType,
        filed: true,
        acceptanceDate: '',
        acceptanceMethod: '',
        notes: '',
      });
      checkedCells += 1;
    }
  }

  if (rows.length > 0) await upsertSimplePayrollFilings(periodKey, rows, updatedBy);
  return { checkedCells, skippedInactive };
}

/**
 * 해당 연도에 간이지급에서 접수(체크)된 소득유형 — 연말정산 표시용.
 * 근로·사업·기타만 (연말과 공유).
 */
export async function listSimplePayrollFiledTypesByYear(
  year: number,
): Promise<Map<string, Set<IncomeTypeKey>>> {
  const rows = await listSimplePayrollFilingsByKeys(simplePayrollPeriodKeysForYear(year));
  const map = new Map<string, Set<IncomeTypeKey>>();
  for (const r of rows) {
    if (!r.filed) continue;
    if (!YEAR_END_SHARED_SIMPLE_TYPES.has(r.incomeType)) continue;
    let set = map.get(r.clientId);
    if (!set) {
      set = new Set();
      map.set(r.clientId, set);
    }
    set.add(r.incomeType);
  }
  return map;
}

/** 접수(체크·근로내용확인 입력)만 초기화 — 소득유형 활성·제외는 유지 */
export async function resetSimplePayrollReceipt(periodKeys: string[]): Promise<void> {
  if (periodKeys.length === 0) return;
  const db = getDb();
  await db
    .update(simplePayrollFilings)
    .set({
      filed: false,
      acceptanceDate: '',
      acceptanceMethod: '',
      updatedAt: new Date(),
    })
    .where(inArray(simplePayrollFilings.periodKey, periodKeys));
}
