import type { ClientRecord } from '@/app/types/client';
import {
  getMainBoardCategory,
  SINGO_DAERI,
} from '@/app/utils/clientsGrouping';
import { companySoftKey, parseRelatedNames } from '@/lib/relatedCompanies';

export type RelatedGroupInfo = {
  groupId: string;
  memberIds: string[];
  /** 핀으로 지정된 대표 — 없으면 빈 문자열 */
  primaryId: string;
  primaryName: string;
  /** 핀이 있으면 핀, 없으면 화면 표시용 대표(저장하지 않음) */
  displayPrimaryId: string;
  displayPrimaryName: string;
  primaryPinned: boolean;
};

function resolvePinnedPrimaryId(members: ClientRecord[]): string {
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

/** 화면 표시용 — 법인 > 개인 > 신고대리 > 기타, 같으면 상호순 (DB에 저장하지 않음) */
function resolveDisplayPrimary(members: ClientRecord[], pinnedId: string): ClientRecord {
  if (pinnedId) {
    const pinned = members.find(m => m.id === pinnedId);
    if (pinned) return pinned;
  }
  const rank = (c: ClientRecord) => {
    const cat = getMainBoardCategory(c);
    if (cat === '법인') return 0;
    if (cat === '개인') return 1;
    if (cat === SINGO_DAERI) return 2;
    return 3;
  };
  return [...members].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
  })[0]!;
}

/** 관계회사 연결 그룹 — 저장 대표는 핀만, 표시 대표는 없으면 분류 우선으로 보완 */
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

    const primaryId = resolvePinnedPrimaryId(members);
    const display = resolveDisplayPrimary(members, primaryId);

    const info: RelatedGroupInfo = {
      groupId: display.id || memberIds.slice().sort()[0]!,
      memberIds,
      primaryId,
      primaryName: primaryId
        ? members.find(m => m.id === primaryId)?.companyName || ''
        : '',
      displayPrimaryId: display.id,
      displayPrimaryName: display.companyName || '',
      primaryPinned: Boolean(primaryId),
    };
    groups.push(info);
    for (const id of memberIds) byClientId.set(id, info);
  }

  return { byClientId, groups };
}

/** 같은 대시보드 분류(법인/개인/신고대리) 안에서만 묶을 멤버 */
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

/** 표시 대표가 이 분류 섹션에 있는지 */
export function displayPrimaryInSection(
  group: RelatedGroupInfo,
  sectionClients: readonly ClientRecord[],
  sectionCategory: string,
): boolean {
  if (!group.displayPrimaryId) return false;
  const primary = sectionClients.find(c => c.id === group.displayPrimaryId);
  if (!primary) return false;
  return getMainBoardCategory(primary) === sectionCategory;
}
