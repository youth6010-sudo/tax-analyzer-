import type { ChurnRecordView, ChurnSummary, ClientRecord, ClientStatus } from '@/app/types/client';
import { clientDuplicateKey } from '@/app/utils/clientBizNo';
import { compactSearchText } from '@/app/utils/searchNormalize';

type ChurnClientRef = Pick<ClientRecord, 'id' | 'companyName' | 'status'> & {
  churn?: ChurnSummary | null;
  nts?: ClientRecord['nts'];
};
/** 수임처에 연결된 유출 이력 — clientId 우선, clientId 없는(엑셀) 건만 상호로 매칭 */
export type ChurnRegistrationIndex = {
  clientIds: Set<string>;
  /** clientId 없이 상호만 있는 유출 이력 */
  orphanCompanyNames: Set<string>;
};

export function buildChurnRegistrationIndex(
  records: Array<{ clientId?: string | null; companyName?: string | null }>,
): ChurnRegistrationIndex {
  const clientIds = new Set<string>();
  const orphanCompanyNames = new Set<string>();
  for (const r of records) {
    const linkedId = (r.clientId ?? '').trim();
    if (linkedId) {
      clientIds.add(linkedId);
      continue;
    }
    const key = compactSearchText(r.companyName ?? '');
    if (key) orphanCompanyNames.add(key);
  }
  return { clientIds, orphanCompanyNames };
}

export function clientMatchesChurnRegistration(
  client: Pick<ClientRecord, 'id' | 'companyName' | 'status'>,
  index: ChurnRegistrationIndex,
): boolean {
  if (index.clientIds.has(client.id)) return true;
  const key = compactSearchText(client.companyName);
  return key ? index.orphanCompanyNames.has(key) : false;
}

export function matchChurnRecordForClient(
  client: Pick<ClientRecord, 'id' | 'companyName'>,
  records: ChurnRecordView[],
): ChurnRecordView | null {
  const byId = records.find(r => r.clientId === client.id);
  if (byId) return byId;

  const nameKey = compactSearchText(client.companyName);
  if (!nameKey) return null;

  // 다른 수임처(clientId 있음)의 동명 이력에는 묶지 않음 — 엑셀 orphan만 상호 매칭
  return (
    records.find(r => {
      const linkedId = (r.clientId ?? '').trim();
      if (linkedId) return false;
      return compactSearchText(r.companyName) === nameKey;
    }) ?? null
  );
}

export function clientNeedsChurnBackfill(
  client: Pick<ClientRecord, 'id' | 'companyName' | 'status'>,
  records: ChurnRecordView[],
): boolean {
  return client.status === 'churned' && !matchChurnRecordForClient(client, records);
}

function clientStatusRank(status: ClientStatus): number {
  if (status === 'active') return 0;
  if (status === 'intake') return 1;
  return 2;
}

/** 유출 등록 검색: 동일 사업자·식별번호라도 상호가 다르면 모두 표시 */
export function dedupeClientsForChurnSearch(clients: ClientRecord[]): ClientRecord[] {
  const byDupKey = new Map<string, ClientRecord[]>();
  const rest: ClientRecord[] = [];

  for (const client of clients) {
    const dupKey = clientDuplicateKey(client);
    if (!dupKey) {
      rest.push(client);
      continue;
    }
    const list = byDupKey.get(dupKey) ?? [];
    list.push(client);
    byDupKey.set(dupKey, list);
  }

  const merged: ClientRecord[] = [...rest];
  for (const group of byDupKey.values()) {
    const byName = new Map<string, ClientRecord>();
    for (const client of group) {
      const nameKey = compactSearchText(client.companyName) || client.id;
      const prev = byName.get(nameKey);
      if (!prev || clientStatusRank(client.status) < clientStatusRank(prev.status)) {
        byName.set(nameKey, client);
      }
    }
    merged.push(...byName.values());
  }

  merged.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  return merged;
}

/** 유출 이력이 등록된 수임처 (상태만 churned인 폐업 건은 미등록으로 봄) */
export function clientHasChurnRegistration(
  client: ChurnClientRef,
  records: Array<{ clientId?: string | null; companyName?: string | null }>,
): boolean {
  if (client.churn) return true;
  return clientMatchesChurnRegistration(client, buildChurnRegistrationIndex(records));
}

/**
 * 폐업·휴업 「유출 처리」 안내 억제용.
 * - 연결된 clientId / orphan 상호 매칭
 * - 이미 유출이력에 같은 상호가 있으면(다른 수임처에 묶여 있어도) 다시 띄우지 않음
 */
export function clientHasHandledNtsChurn(
  client: ChurnClientRef,
  records: Array<{ clientId?: string | null; companyName?: string | null }>,
): boolean {
  if (client.churn) return true;
  if (client.status === 'churned') return true;
  if (clientHasChurnRegistration(client, records)) return true;
  const nameKey = compactSearchText(client.companyName);
  if (!nameKey) return false;
  return records.some(r => compactSearchText(r.companyName ?? '') === nameKey);
}

/** 국세청 폐업·휴업 안내(유출 등록 링크)가 필요한지 */
export function clientNeedsNtsChurnPrompt(
  client: ChurnClientRef,
  records: ChurnRecordView[],
): boolean {
  const code = client.nts?.statusCode;
  if (code !== '02' && code !== '03') return false;
  return !clientHasHandledNtsChurn(client, records);
}

export function filterClientsForChurnRegistration<T extends ClientRecord>(
  clients: T[],
  records: ChurnRecordView[],
): T[] {
  return dedupeClientsForChurnSearch(clients).filter(
    c => !clientHasChurnRegistration(c, records),
  ) as T[];
}