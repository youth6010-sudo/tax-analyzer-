import { and, eq, or, type SQL } from 'drizzle-orm';
import { clients } from '@/db/schema';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import type { SessionUser } from '@/lib/session';
import { isMasterUser, shouldFilterClientsToMine } from '@/lib/masterAccess';

export { isMasterUser, shouldFilterClientsToMine } from '@/lib/masterAccess';
export type { RestrictedClientListScope } from '@/lib/masterAccess';

export type ClientAccessFields = {
  assignedUserId?: string | null;
  manager?: string | null;
};

export function canAccessClient(user: SessionUser, client: ClientAccessFields): boolean {
  if (isMasterUser(user)) return true;
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

/** 정보 수정 권한 = 담당자 본인 또는 마스터 사용자 */
export const canEditClient = canAccessClient;
export const assertCanEditClient = assertCanAccessClient;

/**
 * 조회(읽기)용 — 로그인한 직원은 모든 수임처를 볼 수 있다(전체 업체 파악).
 * 존재 여부만 확인하고 담당자 제한은 두지 않는다.
 */
export function assertClientExists(
  client: ClientAccessFields | null | undefined,
): asserts client is ClientAccessFields {
  if (!client) throw new Error('NOT_FOUND');
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
