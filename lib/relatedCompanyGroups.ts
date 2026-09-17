import type { ClientRecord } from '@/app/types/client';
import { getMainBoardCategory } from '@/app/utils/clientsGrouping';
import { companySoftKey, parseRelatedNames } from '@/lib/relatedCompanies';

export type RelatedGroupInfo = {
  groupId: string;
  memberIds: string[];
  /** 핀으로 지정된 대표 — 없으면 빈 문자열 */
  primaryId: string;
  primaryName: string;
};

function resolvePrimaryId(members: ClientRecord[]): string {
  for (const c of members) {
    const id = String(c.intakeData?.relatedPrimaryId ?? '').trim();
    if (id && members.some(m => m.id === id)) return id;
  }
  const flagged = members.find(c => {
    const v = c.intakeData?.relatedPrimary;
    return v === true || v === 'Y' || v === 'y' || v === '1' || v === 1;
  });
  return flagged?.id ?? '';
}

/** 관계회사 연결 그룹 — 대표는 핀 지정만 인정(자동 지정 없음) */
export function buildRelatedGroups(
  clients: readonly ClientRecord[],
): {
  byClientId: Map<string, RelatedGroupInfo>;
  groups: RelatedGroupInfo[];
} {
  const byId = new Map(clients.map(c => [c.id, c]));
  const bySoft = new Map<string, string>();
  for (const c of clients) {
    const soft = companySoftKey(c.companyName);
    if (soft && !bySoft.has(soft)) bySoft.set(soft, c.id);
  }

  const adj = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const c of clients) {
    const names = parseRelatedNames(String(c.intakeData?.relatedCompanies ?? ''));
    for (const name of names) {
      const peerId = bySoft.get(companySoftKey(name));
      if (peerId && peerId !== c.id) touch(c.id, peerId);
    }
  }

  const visited = new Set<string>();
  const groups: RelatedGroupInfo[] = [];
  const byClientId = new Map<string, RelatedGroupInfo>();

  for (const c of clients) {
    if (visited.has(c.id) || !adj.has(c.id)) continue;
    const memberIds: string[] = [];
    const q = [c.id];
    visited.add(c.id);
    while (q.length) {
      const id = q.pop()!;
      memberIds.push(id);
      for (const n of adj.get(id) ?? []) {
        if (visited.has(n)) continue;
        visited.add(n);
        q.push(n);
      }
    }
    if (memberIds.length < 2) continue;

    const members = memberIds
      .map(id => byId.get(id))
      .filter((x): x is ClientRecord => !!x);

    const primaryId = resolvePrimaryId(members);
    const primary = primaryId ? byId.get(primaryId) : null;

    const info: RelatedGroupInfo = {
      groupId: primaryId || memberIds.slice().sort()[0]!,
      memberIds,
      primaryId,
      primaryName: primary?.companyName || '',
    };
    groups.push(info);
    for (const id of memberIds) byClientId.set(id, info);
  }

  return { byClientId, groups };
}

/** 같은 대시보드 분류(법인/개인) 안에서만 묶을 멤버 */
export function sameSectionMembers(
  group: RelatedGroupInfo,
  sectionClients: readonly ClientRecord[],
  sectionCategory: string,
): ClientRecord[] {
  const inSection = new Set(sectionClients.map(c => c.id));
  return group.memberIds
    .map(id => sectionClients.find(c => c.id === id))
    .filter((c): c is ClientRecord => {
      if (!c || !inSection.has(c.id)) return false;
      return getMainBoardCategory(c) === sectionCategory;
    });
}
