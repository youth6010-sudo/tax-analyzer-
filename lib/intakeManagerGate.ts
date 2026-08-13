import { getManagerMatchNames, managerNamesMatch } from '@/app/utils/managerMatch';
import { isDataViewer } from '@/lib/masterAccess';

type ManagerGateActor = {
  loginId?: string | null;
  role?: string | null;
  adminMode?: boolean | null;
} | null | undefined;

/** 담당자 미지정(빈 값)이거나, 현재 담당자 본인(또는 전체조회 권한)만 변경 가능 */
export function canChangeAssignedManager(
  currentManager: string | null | undefined,
  actorName: string,
  actor?: ManagerGateActor,
): boolean {
  const cur = (currentManager || '').trim();
  if (!cur) return true;
  if (actor && isDataViewer(actor as Parameters<typeof isDataViewer>[0])) return true;
  return managerNamesMatch(cur, actorName);
}

export function assertCanChangeAssignedManager(
  currentManager: string | null | undefined,
  actorName: string,
  actor?: ManagerGateActor,
): void {
  if (!canChangeAssignedManager(currentManager, actorName, actor)) {
    throw new Error('MANAGER_LOCKED');
  }
}

/**
 * 수임처↔유입 담당자 최종값.
 * - 수임처에 담당자가 있으면 우선
 * - 없으면 유입 배정
 * - 둘 다 없고 신규 생성일 때만 행위자 (기존 수임처 동기화에는 actorName을 넘기지 말 것)
 */
export function resolveLinkedManager(opts: {
  clientManager?: string | null;
  inquiryAssignee?: string | null;
  actorName?: string | null;
}): string {
  const clientMgr = (opts.clientManager || '').trim();
  const inquiryMgr = (opts.inquiryAssignee || '').trim();
  const actor = (opts.actorName || '').trim();
  if (clientMgr) return clientMgr;
  if (inquiryMgr) return inquiryMgr;
  return actor;
}

export type ManagerActor = {
  name: string;
  loginId?: string;
  role?: string | null;
  adminMode?: boolean | null;
};

/** 변경 요청 시 권한 검사 후 다음 담당자명 반환 */
export function nextManagerAfterChange(opts: {
  current: string | null | undefined;
  requested: string | null | undefined;
  actor: ManagerActor;
}): string {
  const current = (opts.current || '').trim();
  const requested = (opts.requested || '').trim();
  if ((!current && !requested) || managerNamesMatch(current, requested)) {
    return requested || current;
  }
  assertCanChangeAssignedManager(current, opts.actor.name, opts.actor);
  return requested;
}
