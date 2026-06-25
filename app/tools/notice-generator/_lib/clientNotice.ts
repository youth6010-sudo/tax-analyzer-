import type { TaxTypeKey } from './types';

// 수임처(클라이언트)에 세목별로 저장하는 안내문 입력값.
// clients.intakeData.noticeData[taxType] = { materials, notes }
export type NoticeClientData = {
  materials: string;
  notes: string;
};

export type ClientNoticeMap = Partial<Record<TaxTypeKey, NoticeClientData>>;

// 세목별 기본 필요자료 템플릿 (저장된 값이 없을 때 사용)
export const DEFAULT_MATERIALS_BY_TAX: Record<TaxTypeKey, string> = {
  vat: `- 매출/매입 세금계산서
- 카드/현금영수증 매출 내역
- 통장 거래내역 (해당 기간)`,
  withholding: `- 급여대장 (귀속 월)
- 일용직 지급명세
- 사업소득/기타소득 지급내역`,
  corporate: `- 결산 재무제표 (재무상태표·손익계산서)
- 통장 거래내역 (사업연도 전체)
- 매출/매입 세금계산서 합계표
- 고정자산 취득/처분 내역`,
  income: `- 통장 거래내역 (연간)
- 매출/매입 자료
- 카드 사용내역
- 소득·세액공제 증빙 (보험료·의료비·기부금 등)`,
};

// 수임처 세목(TaxTypeId)을 생성기 세목(TaxTypeKey)으로 매핑
// 수임처는 종합소득세를 'comprehensive'로 사용하므로 'income'으로 변환
export function clientTaxToKey(id: string): TaxTypeKey | null {
  switch (id) {
    case 'comprehensive':
    case 'income':
      return 'income';
    case 'withholding':
      return 'withholding';
    case 'vat':
      return 'vat';
    case 'corporate':
      return 'corporate';
    default:
      return null;
  }
}

const VALID_KEYS: TaxTypeKey[] = ['vat', 'withholding', 'corporate', 'income'];

// intakeData에서 noticeData 맵을 안전하게 읽기
export function readNoticeMap(intakeData: Record<string, unknown> | null | undefined): ClientNoticeMap {
  const raw = (intakeData ?? {})['noticeData'];
  if (!raw || typeof raw !== 'object') return {};
  const out: ClientNoticeMap = {};
  for (const key of VALID_KEYS) {
    const entry = (raw as Record<string, unknown>)[key];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      out[key] = {
        materials: typeof e.materials === 'string' ? e.materials : '',
        notes: typeof e.notes === 'string' ? e.notes : '',
      };
    }
  }
  return out;
}

export type FetchedClientNotice = {
  id: string;
  companyName: string;
  taxTypes: string[];
  intakeData: Record<string, unknown>;
  noticeMap: ClientNoticeMap;
};

// 수임처 상세를 받아 안내문 관련 데이터를 추출
export async function fetchClientNotice(id: string): Promise<FetchedClientNotice> {
  const res = await fetch(`/api/clients/${id}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('수임처 정보를 불러오지 못했습니다.');
  const data = await res.json();
  const client = data.client ?? data.contact;
  const intakeData = (client?.intakeData ?? {}) as Record<string, unknown>;
  return {
    id,
    companyName: client?.companyName ?? '',
    taxTypes: Array.isArray(client?.taxTypes) ? (client.taxTypes as string[]) : [],
    intakeData,
    noticeMap: readNoticeMap(intakeData),
  };
}

// 특정 세목의 안내문 데이터를 저장 (noticeData 맵 전체를 병합해 전송)
export async function saveClientNotice(
  id: string,
  intakeData: Record<string, unknown>,
  taxType: TaxTypeKey,
  data: NoticeClientData,
): Promise<ClientNoticeMap> {
  const currentMap = readNoticeMap(intakeData);
  const nextMap: ClientNoticeMap = { ...currentMap, [taxType]: data };
  const res = await fetch(`/api/clients/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ intakeData: { ...intakeData, noticeData: nextMap } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? '저장하지 못했습니다.');
  }
  return nextMap;
}
