import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import { readArrearsImportConfig, toIsoDate } from '@/lib/arrearsImportConfig';

/** 미수관리 「기준일」 — 업로드 설정 기준일 우선, 없으면 entry max */
export async function getArrearsGlobalAsOfDate(): Promise<string> {
  const cfg = readArrearsImportConfig();
  if (cfg.statusAsOfDate) return toIsoDate(cfg.statusAsOfDate);

  const db = getDb();
  const [row] = await db
    .select({ max: sql<string>`max(${arrearsEntries.asOfDate})` })
    .from(arrearsEntries);
  return String(row?.max || '').trim();
}
