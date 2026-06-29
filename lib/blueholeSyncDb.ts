// 블루홀 거래처 수정 반영 로그 (Phase 2)
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { blueholeSyncLog } from '@/db/schema';

export interface BlueholeSyncLogInput {
  clientId: string;
  blueholeClientId: string;
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
    userId: input.userId,
    userName: input.userName,
    changes: input.changes,
    successCols: input.successCols,
    warnings: input.warnings,
  });
}

export interface BlueholeSyncLogView {
  at: string;
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
    userName: row.userName,
    successCols: row.successCols,
    warnings: row.warnings,
  };
}
