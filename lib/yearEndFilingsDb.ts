import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { yearEndFilings } from '@/db/schema';

export type YearEndIncomeType = 'retirement' | 'interestDividend';

export type YearEndRow = {
  clientId: string;
  incomeType: YearEndIncomeType;
  filed: boolean;
  notes: string;
};

export const YEAR_END_TABLE_TYPES: { key: YearEndIncomeType; label: string }[] = [
  { key: 'retirement', label: '퇴직' },
  { key: 'interestDividend', label: '이자배당' },
];

export async function listYearEndFilings(year: number, clientIds?: string[]): Promise<YearEndRow[]> {
  const db = getDb();
  const conds = [eq(yearEndFilings.year, year)];
  if (clientIds && clientIds.length > 0) {
    conds.push(inArray(yearEndFilings.clientId, clientIds));
  }
  const rows = await db.select().from(yearEndFilings).where(and(...conds));
  return rows.map(r => ({
    clientId: r.clientId,
    incomeType: r.incomeType as YearEndIncomeType,
    filed: r.filed,
    notes: r.notes,
  }));
}

export async function upsertYearEndFilings(
  year: number,
  rows: YearEndRow[],
  updatedBy: string,
): Promise<void> {
  const db = getDb();
  for (const row of rows) {
    const existing = await db
      .select()
      .from(yearEndFilings)
      .where(
        and(
          eq(yearEndFilings.clientId, row.clientId),
          eq(yearEndFilings.year, year),
          eq(yearEndFilings.incomeType, row.incomeType),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(yearEndFilings)
        .set({ filed: row.filed, notes: row.notes, updatedBy, updatedAt: new Date() })
        .where(eq(yearEndFilings.id, existing[0].id));
    } else {
      await db.insert(yearEndFilings).values({
        clientId: row.clientId,
        year,
        incomeType: row.incomeType,
        filed: row.filed,
        notes: row.notes,
        updatedBy,
      });
    }
  }
}

export async function matchYearEndFromExcel(
  year: number,
  bizNos: string[],
  clientBizMap: Map<string, string>,
  clientTypes: Map<string, YearEndIncomeType[]>,
  updatedBy: string,
): Promise<number> {
  const bizSet = new Set(bizNos.map(b => b.replace(/\D/g, '')));
  let matched = 0;
  const rows: YearEndRow[] = [];

  for (const [clientId, biz] of clientBizMap) {
    const norm = biz.replace(/\D/g, '');
    if (norm.length !== 10 || !bizSet.has(norm)) continue;
    const types = clientTypes.get(clientId) ?? [];
    for (const incomeType of types) {
      rows.push({ clientId, incomeType, filed: true, notes: '' });
      matched += 1;
    }
  }

  if (rows.length > 0) await upsertYearEndFilings(year, rows, updatedBy);
  return matched;
}
