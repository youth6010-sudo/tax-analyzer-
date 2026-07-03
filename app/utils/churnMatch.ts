import type { ChurnRecordView, ClientRecord } from '@/app/types/client';
import { compactSearchText } from '@/app/utils/searchNormalize';

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
