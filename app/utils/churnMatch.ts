import type { ChurnRecordView, ChurnSummary, ClientRecord, ClientStatus } from '@/app/types/client';
import { clientDuplicateKey } from '@/app/utils/clientBizNo';
import { compactSearchText } from '@/app/utils/searchNormalize';

type ChurnClientRef = Pick<ClientRecord, 'id' | 'companyName' | 'status'> & {
  churn?: ChurnSummary | null;
  nts?: ClientRecord['nts'];
};
/** 수임처에 연결된 유출 이력 — clientId 또는 상호(엑셀 import 등 clientId 미연결) */
export function matchChurnRecordForClient(
  client: Pick<ClientRecord, 'id' | 'companyName'>,
  records: ChurnRecordView[],
): ChurnRecordView | null {
  const byId = records.find(r => r.clientId === client.id);
  if (byId) return byId;

  const nameKey = compactSearchText(client.companyName);
  if (!nameKey) return null;

  return records.find(r => compactSearchText(r.companyName) === nameKey) ?? null;
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

/** 유출 등록 검색: 동일 사업자·식별번호 중복 수임처는 1건만 표시 */
export function dedupeClientsForChurnSearch(clients: ClientRecord[]): ClientRecord[] {
  const byDupKey = new Map<string, ClientRecord>();
  const rest: ClientRecord[] = [];

  for (const client of clients) {
    const dupKey = clientDuplicateKey(client);
    if (!dupKey) {
      rest.push(client);
      continue;
    }
    const prev = byDupKey.get(dupKey);
    if (!prev || clientStatusRank(client.status) < clientStatusRank(prev.status)) {
      byDupKey.set(dupKey, client);
    }
  }

  const merged = [...byDupKey.values(), ...rest];
  merged.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  return merged;
}

/** 유출 이력이 있거나 이미 유출 상태인 수임처 */
export function clientHasChurnRegistration(
  client: ChurnClientRef,
  records: ChurnRecordView[],
): boolean {
  if (client.churn) return true;
  if (matchChurnRecordForClient(client, records)) return true;
  return client.status === 'churned';
}

/** 국세청 폐업·휴업 안내(유출 등록 링크)가 필요한지 */
export function clientNeedsNtsChurnPrompt(
  client: ChurnClientRef,
  records: ChurnRecordView[],
): boolean {  const code = client.nts?.statusCode;
  if (code !== '02' && code !== '03') return false;
  return !clientHasChurnRegistration(client, records);
}

export function filterClientsForChurnRegistration<T extends ClientRecord>(
  clients: T[],
  records: ChurnRecordView[],
): T[] {
  return dedupeClientsForChurnSearch(clients).filter(
    c => !clientHasChurnRegistration(c, records),
  ) as T[];
}