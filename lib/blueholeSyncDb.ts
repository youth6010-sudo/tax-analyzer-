// 블루홀 거래처 변경 감사 로그 (Phase 2 동기화 + Phase 5 감사)
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { blueholeSyncLog } from '@/db/schema';

export type BlueholeSyncAction = 'create' | 'update' | 'link' | 'unlink';

export interface BlueholeSyncLogInput {
  clientId: string;
  blueholeClientId: string;
  action?: BlueholeSyncAction;
  userId: string | null;
  userName: string;
  changes: Record<string, string>;
  successCols: string[];
  warnings: string[];
}

export async function insertBlueholeSyncLog(input: BlueholeSyncLogInput): Promise<void> {
  const db = getDb();
  await db.insert(blueholeSyncLog).values({
    clientId: input.clientId,
    blueholeClientId: input.blueholeClientId,
    action: input.action || 'update',
    userId: input.userId,
    userName: input.userName,
    changes: input.changes,
    successCols: input.successCols,
    warnings: input.warnings,
  });
}

export interface BlueholeSyncLogView {
  at: string;
  action: BlueholeSyncAction;
  userName: string;
  successCols: string[];
  warnings: string[];
}

export async function getLastSyncForClient(clientId: string): Promise<BlueholeSyncLogView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blueholeSyncLog)
    .where(eq(blueholeSyncLog.clientId, clientId))
    .orderBy(desc(blueholeSyncLog.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    at: row.createdAt.toISOString(),
    action: (row.action as BlueholeSyncAction) || 'update',
    userName: row.userName,
    successCols: row.successCols,
    warnings: row.warnings,
  };
}

export interface BlueholeSyncLogEntry {
  id: string;
  at: string;
  action: BlueholeSyncAction;
  clientId: string;
  blueholeClientId: string;
  userName: string;
  changes: Record<string, string>;
  successCols: string[];
  warnings: string[];
}

function toEntry(row: typeof blueholeSyncLog.$inferSelect): BlueholeSyncLogEntry {
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    action: (row.action as BlueholeSyncAction) || 'update',
    clientId: row.clientId,
    blueholeClientId: row.blueholeClientId,
    userName: row.userName,
    changes: row.changes,
    successCols: row.successCols,
    warnings: row.warnings,
  };
}

/** 특정 수임처의 변경 로그(최신순) */
export async function getSyncLogForClient(clientId: string, limit = 30): Promise<BlueholeSyncLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(blueholeSyncLog)
    .where(eq(blueholeSyncLog.clientId, clientId))
    .orderBy(desc(blueholeSyncLog.createdAt))
    .limit(limit);
  return rows.map(toEntry);
}

/** 전역 감사 로그(관리자) — 페이지네이션 */
export async function listAllSyncLogs(opts: { limit?: number; offset?: number } = {}): Promise<{
  entries: BlueholeSyncLogEntry[];
  total: number;
}> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit || 100, 1), 500);
  const offset = Math.max(opts.offset || 0, 0);
  const rows = await db
    .select()
    .from(blueholeSyncLog)
    .orderBy(desc(blueholeSyncLog.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(blueholeSyncLog);
  return { entries: rows.map(toEntry), total: Number(count) || 0 };
}
