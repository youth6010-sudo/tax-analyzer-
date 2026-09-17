import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients } from '@/db/schema';
import {
  applyManagerToClient,
  applyManagerToLinkedInquiries,
} from '@/lib/intakeManagerSync';
import {
  companySoftKey,
  joinRelatedNames,
  parseRelatedNames,
} from '@/lib/relatedCompanies';

type ClientLite = {
  id: string;
  companyName: string;
  manager: string;
  status: string;
  intakeData: Record<string, unknown> | null;
};

function isInactiveRelatedPeer(c: ClientLite): boolean {
  if (c.status === 'churned') return true;
  const cat = String(c.intakeData?.category ?? '').trim();
  return cat === '미사용';
}

function relatedPeerRank(c: ClientLite): number {
  // 낮을수록 우선 — 활성·사용 분류를 미사용/해임보다 앞에
  if (isInactiveRelatedPeer(c)) return 2;
  if (c.status !== 'active' && c.status !== 'contract') return 1;
  return 0;
}

async function loadClientIndex(): Promise<{
  byId: Map<string, ClientLite>;
  bySoft: Map<string, ClientLite[]>;
}> {
  const db = getDb();
  const rows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      manager: clients.manager,
      status: clients.status,
      intakeData: clients.intakeData,
    })
    .from(clients);

  const byId = new Map<string, ClientLite>();
  const bySoft = new Map<string, ClientLite[]>();
  for (const row of rows) {
    const lite: ClientLite = {
      id: row.id,
      companyName: row.companyName || '',
      manager: (row.manager || '').trim(),
      status: row.status || '',
      intakeData: (row.intakeData as Record<string, unknown> | null) ?? null,
    };
    byId.set(lite.id, lite);
    const soft = companySoftKey(lite.companyName);
    if (!soft) continue;
    const list = bySoft.get(soft) ?? [];
    list.push(lite);
    bySoft.set(soft, list);
  }
  return { byId, bySoft };
}

function resolveByName(
  name: string,
  bySoft: Map<string, ClientLite[]>,
): ClientLite | null {
  const soft = companySoftKey(name);
  if (!soft) return null;
  const list = bySoft.get(soft);
  if (!list?.length) return null;
  return [...list].sort((a, b) => relatedPeerRank(a) - relatedPeerRank(b))[0] ?? null;
}

async function patchIntake(
  peerId: string,
  existingIntake: Record<string, unknown> | null,
  mutator: (intake: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> {
  const db = getDb();
  const nextIntake = { ...(existingIntake ?? {}) };
  mutator(nextIntake);
  await db
    .update(clients)
    .set({ intakeData: nextIntake, updatedAt: new Date() })
    .where(eq(clients.id, peerId));
  return nextIntake;
}

function applyPrimaryFlags(
  intake: Record<string, unknown>,
  selfId: string,
  primaryId: string | null,
) {
  if (primaryId) {
    intake.relatedPrimaryId = primaryId;
    if (selfId === primaryId) intake.relatedPrimary = true;
    else delete intake.relatedPrimary;
  } else {
    delete intake.relatedPrimaryId;
    delete intake.relatedPrimary;
  }
}

/**
 * 관계회사 그룹을 완전 그래프로 맞춤.
 * - 각 멤버의 relatedCompanies = 나머지 멤버 상호 (동일 집합)
 * - 대표(primaryId)는 그룹에 1명만 (없으면 미지정)
 * - 그룹에서 빠진 멤버는 옛 그룹 링크를 제거
 */
export async function syncRelatedCompanyGroupMesh(
  sourceId: string,
  prevRaw: string | null | undefined,
  nextRaw: string | null | undefined,
  primaryId: string | null,
): Promise<void> {
  const { byId, bySoft } = await loadClientIndex();
  const source = byId.get(sourceId);
  if (!source) return;

  const resolveMembers = (raw: string | null | undefined): Set<string> => {
    const ids = new Set<string>([sourceId]);
    for (const name of parseRelatedNames(raw)) {
      const peer = resolveByName(name, bySoft);
      if (peer) ids.add(peer.id);
    }
    return ids;
  };

  const prevMembers = resolveMembers(prevRaw);
  const nextMembers = resolveMembers(nextRaw);
  const nextList = [...nextMembers];

  let pinned =
    primaryId && nextMembers.has(primaryId) ? primaryId : null;
  // 대표가 그룹 밖이면 미지정 (자동 지정하지 않음)
  if (pinned && !nextMembers.has(pinned)) pinned = null;
  if (nextMembers.size < 2) pinned = null;

  const memberName = (id: string) => (byId.get(id)?.companyName || '').trim();

  for (const id of nextList) {
    const peer = byId.get(id);
    if (!peer) continue;
    const others = nextList
      .filter(x => x !== id)
      .map(memberName)
      .filter(Boolean);
    const joined = joinRelatedNames(others);
    const nextIntake = await patchIntake(id, peer.intakeData, intake => {
      if (joined) intake.relatedCompanies = joined;
      else delete intake.relatedCompanies;
      applyPrimaryFlags(intake, id, pinned);
    });
    peer.intakeData = nextIntake;
  }

  for (const id of prevMembers) {
    if (nextMembers.has(id)) continue;
    const peer = byId.get(id);
    if (!peer) continue;
    const prevSoft = new Set(
      [...prevMembers]
        .map(memberName)
        .map(companySoftKey)
        .filter(Boolean),
    );
    const kept = parseRelatedNames(String(peer.intakeData?.relatedCompanies ?? '')).filter(
      n => !prevSoft.has(companySoftKey(n)),
    );
    const nextIntake = await patchIntake(id, peer.intakeData, intake => {
      if (kept.length) intake.relatedCompanies = joinRelatedNames(kept);
      else delete intake.relatedCompanies;
      const curPrimary = String(intake.relatedPrimaryId ?? '');
      if (curPrimary && prevMembers.has(curPrimary)) {
        delete intake.relatedPrimaryId;
        delete intake.relatedPrimary;
      }
      if (intake.relatedPrimary && prevMembers.has(id)) {
        delete intake.relatedPrimary;
      }
    });
    peer.intakeData = nextIntake;
  }
}

/** @deprecated — mesh 동기화로 대체. 호환용 래퍼 */
export async function syncRelatedCompanyLinks(
  sourceId: string,
  prevRaw: string | null | undefined,
  nextRaw: string | null | undefined,
): Promise<void> {
  await syncRelatedCompanyGroupMesh(sourceId, prevRaw, nextRaw, null);
}

/**
 * source의 relatedCompanies(+역방향)로 연결된 그룹을 source manager로 통일.
 */
export async function syncManagerToRelatedCompanies(
  sourceId: string,
  managerName: string,
): Promise<number> {
  const mgr = managerName.trim();
  const { byId, bySoft } = await loadClientIndex();
  const source = byId.get(sourceId);
  if (!source) return 0;

  const groupIds = new Set<string>([sourceId]);
  const queue = [sourceId];

  while (queue.length) {
    const curId = queue.pop()!;
    const cur = byId.get(curId);
    if (!cur) continue;
    const names = parseRelatedNames(String(cur.intakeData?.relatedCompanies ?? ''));
    for (const name of names) {
      const peer = resolveByName(name, bySoft);
      if (!peer || groupIds.has(peer.id)) continue;
      groupIds.add(peer.id);
      queue.push(peer.id);
    }
    const mySoft = companySoftKey(cur.companyName);
    if (mySoft) {
      for (const peer of byId.values()) {
        if (groupIds.has(peer.id)) continue;
        const peerNames = parseRelatedNames(
          String(peer.intakeData?.relatedCompanies ?? ''),
        );
        if (peerNames.some(n => companySoftKey(n) === mySoft)) {
          groupIds.add(peer.id);
          queue.push(peer.id);
        }
      }
    }
  }

  const sourceLite = byId.get(sourceId);
  // 미사용·해임에서 관계 편집해도 활성 수임처 담당을 덮지 않음
  if (sourceLite && isInactiveRelatedPeer(sourceLite)) return 0;

  let n = 0;
  for (const id of groupIds) {
    if (id === sourceId) continue;
    const peer = byId.get(id);
    if (!peer) continue;
    if (isInactiveRelatedPeer(peer)) continue;
    if ((peer.manager || '').trim() === mgr) continue;
    await applyManagerToClient(id, mgr);
    await applyManagerToLinkedInquiries(id, mgr);
    n += 1;
  }
  return n;
}

/** 관계회사 변경 후 링크 동기화 + 담당 통일 */
export async function afterRelatedCompaniesChanged(
  sourceId: string,
  prevRaw: string | null | undefined,
  nextRaw: string | null | undefined,
  sourceManager: string,
  primaryId: string | null = null,
): Promise<void> {
  await syncRelatedCompanyGroupMesh(sourceId, prevRaw, nextRaw, primaryId);
  const nextNames = parseRelatedNames(nextRaw);
  if (nextNames.length || parseRelatedNames(prevRaw).length) {
    await syncManagerToRelatedCompanies(sourceId, sourceManager);
  }
}

/** 대표만 바꿀 때 — 그룹 멤버 전원 relatedPrimaryId 맞춤 */
export async function applyRelatedPrimaryToGroup(
  sourceId: string,
  primaryId: string | null,
): Promise<void> {
  const { byId, bySoft } = await loadClientIndex();
  const source = byId.get(sourceId);
  if (!source) return;

  const groupIds = new Set<string>([sourceId]);
  const queue = [sourceId];
  while (queue.length) {
    const curId = queue.pop()!;
    const cur = byId.get(curId);
    if (!cur) continue;
    for (const name of parseRelatedNames(String(cur.intakeData?.relatedCompanies ?? ''))) {
      const peer = resolveByName(name, bySoft);
      if (!peer || groupIds.has(peer.id)) continue;
      groupIds.add(peer.id);
      queue.push(peer.id);
    }
  }

  const pinned = primaryId && groupIds.has(primaryId) ? primaryId : null;
  if (groupIds.size < 2) {
    for (const id of groupIds) {
      const peer = byId.get(id);
      if (!peer) continue;
      await patchIntake(id, peer.intakeData, intake => {
        delete intake.relatedPrimaryId;
        delete intake.relatedPrimary;
      });
    }
    return;
  }

  for (const id of groupIds) {
    const peer = byId.get(id);
    if (!peer) continue;
    await patchIntake(id, peer.intakeData, intake => {
      applyPrimaryFlags(intake, id, pinned);
    });
  }
}

/** @deprecated clearRelatedPrimaryOnPeers — applyRelatedPrimaryToGroup 사용 */
export async function clearRelatedPrimaryOnPeers(sourceId: string): Promise<void> {
  const { byId } = await loadClientIndex();
  const source = byId.get(sourceId);
  const primaryId =
    source &&
    (source.intakeData?.relatedPrimary === true ||
      source.intakeData?.relatedPrimary === 'Y' ||
      source.intakeData?.relatedPrimaryId === sourceId)
      ? sourceId
      : String(source?.intakeData?.relatedPrimaryId ?? '') || null;
  await applyRelatedPrimaryToGroup(sourceId, primaryId && primaryId.length ? primaryId : sourceId);
}
