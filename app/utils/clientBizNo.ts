import type { ClientRecord } from '@/app/types/client';
import type { BusinessEntityType } from '@/app/types/contact';
import { getClientCategory, NON_BUSINESS_CATEGORY } from '@/app/utils/clientsGrouping';
import { normalizeBizNo } from '@/app/utils/filingCheck';

export function clientBizNoKey(client: Pick<ClientRecord, 'businessNo'>): string {
  return normalizeBizNo(client.businessNo);
}

export function clientResidentNoKey(client: Pick<ClientRecord, 'residentNo'>): string {
  return String(client.residentNo ?? '').replace(/\D/g, '');
}

export function clientCorporateNoKey(client: Pick<ClientRecord, 'corporateNo'>): string {
  return String(client.corporateNo ?? '').replace(/\D/g, '');
}

/** 법인 — 사업자번호+법인등록번호 / 개인·비사업자 — 사업자번호+주민등록번호 */
export function isCorporateDuplicateClient(
  client: Pick<ClientRecord, 'businessEntityType' | 'intakeData'>,
): boolean {
  if (client.businessEntityType === 'corporate') return true;
  return getClientCategory(client as ClientRecord) === '법인';
}

export function duplicateIdKind(
  client: Pick<ClientRecord, 'businessEntityType' | 'intakeData'>,
): 'corporate' | 'personal' | null {
  if (isCorporateDuplicateClient(client)) return 'corporate';
  const ent = client.businessEntityType;
  if (ent === 'individual' || ent === 'nonBusiness' || ent === '') return 'personal';
  const cat = getClientCategory(client as ClientRecord);
  if (cat === '개인' || cat === NON_BUSINESS_CATEGORY) return 'personal';
  if (cat === '법인') return 'corporate';
  return null;
}

/** 중복 판별 키 — 구분·대분류에 따라 번호 쌍이 달라진다 */
export function clientDuplicateKey(
  client: Pick<ClientRecord, 'businessNo' | 'corporateNo' | 'residentNo' | 'businessEntityType' | 'intakeData'>,
): string | null {
  const biz = clientBizNoKey(client);
  if (biz.length !== 10) return null;

  const kind = duplicateIdKind(client);
  if (kind === 'corporate') {
    const corp = clientCorporateNoKey(client);
    if (corp.length !== 13) return null;
    return `corp:${biz}|${corp}`;
  }
  if (kind === 'personal') {
    const res = clientResidentNoKey(client);
    if (res.length !== 13) return null;
    return `pers:${biz}|${res}`;
  }
  return null;
}

export function buildBizNoDuplicateCounts(
  clients: readonly Pick<
    ClientRecord,
    'businessNo' | 'corporateNo' | 'residentNo' | 'businessEntityType' | 'intakeData'
  >[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of clients) {
    const key = clientDuplicateKey(c);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function isDuplicateBizNoClient(
  client: Pick<
    ClientRecord,
    'businessNo' | 'corporateNo' | 'residentNo' | 'businessEntityType' | 'intakeData'
  >,
  counts: Map<string, number>,
): boolean {
  const key = clientDuplicateKey(client);
  if (!key) return false;
  return (counts.get(key) ?? 0) > 1;
}

export function businessEntityTypeForCategory(category: string): BusinessEntityType | '' {
  if (category === '개인') return 'individual';
  if (category === '법인') return 'corporate';
  if (category === NON_BUSINESS_CATEGORY) return 'nonBusiness';
  return '';
}
