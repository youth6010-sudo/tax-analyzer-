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
  intakeData: Record<string, unknown> | null;
};

async function loadClientIndex(): Promise<{
  byId: Map<string, ClientLite>;
  bySoft: Map<string, ClientLite>;
}> {
  const db = getDb();
  const rows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      manager: clients.manager,
      intakeData: clients.intakeData,
    })
    .from(clients);

  const byId = new Map<string, ClientLite>();
  const bySoft = new Map<string, ClientLite>();
  for (const row of rows) {
    const lite: ClientLite = {
      id: row.id,
      companyName: row.companyName || '',
      manager: (row.manager || '').trim(),
      intakeData: (row.intakeData as Record<string, unknown> | null) ?? null,
    };
    byId.set(lite.id, lite);
    const soft = companySoftKey(lite.companyName);
    if (soft && !bySoft.has(soft)) bySoft.set(soft, lite);
  }
  return { byId, bySoft };
}

function resolveByName(
  name: string,
  bySoft: Map<string, ClientLite>,
): ClientLite | null {
  const soft = companySoftKey(name);
  if (!soft) return null;
  return bySoft.get(soft) ?? null;
}

/** peer intake의 relatedCompanies만 직접 갱신 (재귀 sync 없음) */
async function patchRelatedCompaniesOnly(
  peerId: string,
  nextRelated: string,
  existingIntake: Record<string, unknown> | null,
): Promise<void> {
  const db = getDb();
  const nextIntake = { ...(existingIntake ?? {}) };
  if (nextRelated.trim()) nextIntake.relatedCompanies = nextRelated.trim();
  else delete nextIntake.relatedCompanies;
  await db
    .update(clients)
    .set({ intakeData: nextIntake, updatedAt: new Date() })
    .where(eq(clients.id, peerId));
}

/**
 * A의 관계회사 추가/제거에 맞춰 상대 수임처에 역링크를 맞춘다.
 * peer 패치는 relatedCompanies만 직접 UPDATE (재진입 없음).
 */
export async function syncRelatedCompanyLinks(
  sourceId: string,
  prevRaw: string | null | undefined,
  nextRaw: string | null | undefined,
): Promise<void> {
  const prev = new Set(parseRelatedNames(prevRaw));
  const next = new Set(parseRelatedNames(nextRaw));
  const added = [...next].filter(n => !prev.has(n));
  const removed = [...prev].filter(n => !next.has(n));
  if (!added.length && !removed.length) return;

  const { byId, bySoft } = await loadClientIndex();
  const source = byId.get(sourceId);
  if (!source) return;
  const sourceName = source.companyName.trim();
  if (!sourceName) return;

  for (const name of added) {
    const peer = resolveByName(name, bySoft);
    if (!peer || peer.id === sourceId) continue;
    const peerNames = parseRelatedNames(
      String(peer.intakeData?.relatedCompanies ?? ''),
    );
    if (peerNames.some(n => companySoftKey(n) === companySoftKey(sourceName))) {
      continue;
    }
    const joined = joinRelatedNames([...peerNames, sourceName]);
    await patchRelatedCompaniesOnly(peer.id, joined, peer.intakeData);
    peer.intakeData = {
      ...(peer.intakeData ?? {}),
      relatedCompanies: joined,
    };
  }

  for (const name of removed) {
    const peer = resolveByName(name, bySoft);
    if (!peer || peer.id === sourceId) continue;
    const peerNames = parseRelatedNames(
      String(peer.intakeData?.relatedCompanies ?? ''),
    );
    const filtered = peerNames.filter(
      n => companySoftKey(n) !== companySoftKey(sourceName),
    );
    if (filtered.length === peerNames.length) continue;
    const joined = joinRelatedNames(filtered);
    await patchRelatedCompaniesOnly(peer.id, joined, peer.intakeData);
    peer.intakeData = joined
      ? { ...(peer.intakeData ?? {}), relatedCompanies: joined }
      : (() => {
          const nextIntake = { ...(peer.intakeData ?? {}) };
          delete nextIntake.relatedCompanies;
          return nextIntake;
        })();
  }
}

/**
 * source의 relatedCompanies(+역방향)로 연결된 그룹을 source manager로 통일.
 * applyManagerToClient 사용 → 미수 연동 포함. 재진입 없음(peer만 직접 적용).
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
    // 역방향: 다른 업체가 나를 관계로 가리키는 경우
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

  let n = 0;
  for (const id of groupIds) {
    if (id === sourceId) continue;
    const peer = byId.get(id);
    if (!peer) continue;
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
): Promise<void> {
  await syncRelatedCompanyLinks(sourceId, prevRaw, nextRaw);
  const nextNames = parseRelatedNames(nextRaw);
  if (nextNames.length || parseRelatedNames(prevRaw).length) {
    await syncManagerToRelatedCompanies(sourceId, sourceManager);
  }
}
