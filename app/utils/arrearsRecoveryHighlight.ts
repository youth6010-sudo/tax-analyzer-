import type { ClientRecord } from '@/app/types/client';

/** 미수·수임처 상호 매칭용 (공백 무시) */
export function companyNameMatchKey(name: string): string {
  return String(name || '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export type ArrearsRecoveryRefs = {
  clientIds: ReadonlySet<string>;
  companyKeys: ReadonlySet<string>;
};

export function emptyArrearsRecoveryRefs(): ArrearsRecoveryRefs {
  return { clientIds: new Set(), companyKeys: new Set() };
}

export function buildArrearsRecoveryRefs(data: {
  clientIds?: string[];
  companyKeys?: string[];
}): ArrearsRecoveryRefs {
  return {
    clientIds: new Set((data.clientIds ?? []).filter(Boolean)),
    companyKeys: new Set((data.companyKeys ?? []).filter(Boolean)),
  };
}

/** 미수관리 관리분류 = 채권회수 */
export function isArrearsRecoveryClient(
  client: Pick<ClientRecord, 'id' | 'companyName'>,
  refs: ArrearsRecoveryRefs,
): boolean {
  if (refs.clientIds.has(client.id)) return true;
  const key = companyNameMatchKey(client.companyName);
  return key !== '' && refs.companyKeys.has(key);
}
