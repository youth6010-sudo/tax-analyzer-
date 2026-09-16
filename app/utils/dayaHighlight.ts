import type { ClientRecord } from '@/app/types/client';

/** 다야 담당(또는 다야에서 이관) 수임처 — 목록에서 파란색 구분 */
export function isDayaHighlightedClient(
  client: Pick<ClientRecord, 'manager' | 'intakeData'>,
): boolean {
  if ((client.manager ?? '').trim() === '다야') return true;
  const flag = client.intakeData?.dayaHighlight;
  return flag === true || flag === 'true' || flag === 1;
}
