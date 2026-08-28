import type { ChurnRecordView, ClientRecord, NtsStatusCache } from '@/app/types/client';
import {
  clientHasHandledNtsChurn,
  clientNeedsNtsChurnPrompt,
  clientNeedsNtsRestingAck,
} from '@/app/utils/churnMatch';
import {
  getClientCategory,
  JISUTAEK_CATEGORY,
  NON_BUSINESS_CATEGORY,
  SINGO_DAERI,
  UNUSED_CATEGORY,
} from '@/app/utils/clientsGrouping';
import { getNtsTaxTypeMismatch } from '@/app/utils/ntsStatus';
import { hasPlaceholderBizNo } from '@/app/utils/filingCheck';

/** 폐업·휴업 점검 대상에서 제외 (신고대리·지주택·비사업자·유출 등) */
export function clientExcludedFromNtsMonitor(client: ClientRecord): boolean {
  if (client.status === 'churned') return true;

  const cat = getClientCategory(client);
  if (
    cat === SINGO_DAERI ||
    cat === JISUTAEK_CATEGORY ||
    cat === UNUSED_CATEGORY ||
    cat === NON_BUSINESS_CATEGORY
  ) {
    return true;
  }

  if (client.businessEntityType === 'nonBusiness') return true;

  return false;
}

export function clientHasMonitorableBusinessNo(client: ClientRecord): boolean {
  const biz = String(client.businessNo || '').replace(/\D/g, '');
  if (biz.length !== 10) return false;
  return !hasPlaceholderBizNo(client);
}

export type NtsMonitorRowKind = 'closed' | 'resting' | 'mismatch' | 'unchecked' | 'ok';

export function classifyNtsMonitorRow(
  client: ClientRecord,
  nts: NtsStatusCache | null,
  churnRecords: ChurnRecordView[],
): { kind: NtsMonitorRowKind; mismatch: boolean; needsAction: boolean } {
  if (clientExcludedFromNtsMonitor(client)) {
    return { kind: 'ok', mismatch: false, needsAction: false };
  }

  const clientTaxKind = String(client.intakeData?.taxKind ?? '');
  const mismatch = !!(nts?.taxType && getNtsTaxTypeMismatch(clientTaxKind, nts.taxType));

  if (!nts?.checkedAt) {
    const unchecked = clientHasMonitorableBusinessNo(client);
    return {
      kind: unchecked ? 'unchecked' : 'ok',
      mismatch: false,
      needsAction: unchecked,
    };
  }

  const merged = { ...client, nts };

  if (nts.statusCode === '03') {
    const needs = clientNeedsNtsChurnPrompt(merged, churnRecords);
    return {
      kind: needs ? 'closed' : 'ok',
      mismatch,
      needsAction: needs,
    };
  }

  if (nts.statusCode === '02') {
    const needs = clientNeedsNtsRestingAck(merged);
    return {
      kind: needs ? 'resting' : 'ok',
      mismatch,
      needsAction: needs,
    };
  }

  if (mismatch) {
    return { kind: 'mismatch', mismatch: true, needsAction: true };
  }

  return { kind: 'ok', mismatch: false, needsAction: false };
}

/** 주의 필요 탭에 넣을지 */
export function clientNeedsNtsMonitorAttention(
  client: ClientRecord,
  nts: NtsStatusCache | null,
  churnRecords: ChurnRecordView[],
): boolean {
  const { kind } = classifyNtsMonitorRow(client, nts, churnRecords);
  return kind !== 'ok';
}

/** 유출 이력이 있으면 폐업 알림 억제 (상태가 active여도) */
export function clientSuppressesNtsChurnAlert(
  client: ClientRecord,
  churnRecords: ChurnRecordView[],
): boolean {
  return clientHasHandledNtsChurn(client, churnRecords);
}
