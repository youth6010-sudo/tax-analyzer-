import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { simplePayrollFilings } from '@/db/schema';
import type { IncomeTypeKey } from '@/app/types/incomeTypes';

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

    if (existing[0]) {
      await db
        .update(simplePayrollFilings)
        .set({
          filed: row.filed,
          acceptanceDate: row.acceptanceDate,
          acceptanceMethod: row.acceptanceMethod,
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
        filed: row.filed,
        acceptanceDate: row.acceptanceDate,
        acceptanceMethod: row.acceptanceMethod,
        notes: row.notes,
        updatedBy,
      });
    }
  }
}

/** 엑셀 접수 — 사업자번호 매칭 시 해당 소득유형 filed=true (laborContentReport 제외) */
export async function matchSimplePayrollFromExcel(
  periodKey: string,
  bizNos: string[],
  clientBizMap: Map<string, string>,
  clientIncomeTypes: Map<string, IncomeTypeKey[]>,
  updatedBy: string,
): Promise<number> {
  const bizSet = new Set(bizNos.map(b => b.replace(/\D/g, '')));
  let matched = 0;
  const rows: SimplePayrollRow[] = [];

  for (const [clientId, biz] of clientBizMap) {
    const norm = biz.replace(/\D/g, '');
    if (norm.length !== 10 || !bizSet.has(norm)) continue;
    const types = clientIncomeTypes.get(clientId) ?? [];
    for (const incomeType of types) {
      if (incomeType === 'laborContentReport') continue;
      rows.push({
        periodKey,
        clientId,
        incomeType,
        filed: true,
        acceptanceDate: '',
        acceptanceMethod: '',
        notes: '',
      });
      matched += 1;
    }
  }

  if (rows.length > 0) await upsertSimplePayrollFilings(periodKey, rows, updatedBy);
  return matched;
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
