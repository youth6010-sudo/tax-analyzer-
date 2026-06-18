import { and, eq, or, type SQL } from 'drizzle-orm';
import { clients } from '@/db/schema';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import type { SessionUser } from '@/lib/session';

export type ClientAccessFields = {
  assignedUserId?: string | null;
  manager?: string | null;
};

export function canAccessClient(user: SessionUser, client: ClientAccessFields): boolean {
  if (user.role === 'admin') return true;
  if (client.assignedUserId === user.id) return true;
  const matchNames = getManagerMatchNames(user.name);
  return matchNames.some(name => name === (client.manager ?? ''));
}

export function assertCanAccessClient(
  user: SessionUser,
  client: ClientAccessFields | null | undefined,
): asserts client is ClientAccessFields {
  if (!client) throw new Error('NOT_FOUND');
  if (!canAccessClient(user, client)) throw new Error('FORBIDDEN');
}

/** list/search 쿼리용 — 담당자·배정 사용자 필터 */
export function buildMineOnlyClientCondition(
  userId: string,
  userName: string,
): SQL | undefined {
  const matchNames = getManagerMatchNames(userName);
  const managerConds = matchNames.map(name => eq(clients.manager, name));
  return or(eq(clients.assignedUserId, userId), ...(managerConds.length > 0 ? managerConds : []));
}

export function mergeClientConditions(...parts: (SQL | undefined)[]): SQL | undefined {
  const conds = parts.filter((p): p is SQL => p != null);
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0];
  return and(...conds);
}
