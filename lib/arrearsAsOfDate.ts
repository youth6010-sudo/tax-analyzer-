import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';

/** 미수관리 「기준일」 — 전체 entry asOfDate 최대값 */
export async function getArrearsGlobalAsOfDate(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ max: sql<string>`max(${arrearsEntries.asOfDate})` })
    .from(arrearsEntries);
  return String(row?.max || '').trim();
}
