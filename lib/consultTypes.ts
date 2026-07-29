/** 문의유형 선택지 (신규·필터 표시) */
export const CONSULT_TYPE_OPTIONS = ['기장', '신고', '양도·증여'] as const;

export type ConsultTypeOption = (typeof CONSULT_TYPE_OPTIONS)[number];

export const BOOKKEEPING_CONSULT_TYPE = '기장';
export const FILING_CONSULT_TYPE = '신고';
export const TRANSFER_CONSULT_TYPE = '양도·증여';

/** 예전 라벨 → 현재 라벨 */
const LEGACY_CONSULT_TYPE_MAP: Record<string, ConsultTypeOption> = {
  기장문의: '기장',
  기장: '기장',
  신고문의: '신고',
  신고: '신고',
  '양도세/증여세 문의': '양도·증여',
  '양도세·증여세 문의': '양도·증여',
  '양도·증여': '양도·증여',
};

export function canonicalizeConsultType(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return LEGACY_CONSULT_TYPE_MAP[t] ?? t;
}

export function parseConsultTypes(raw: unknown): string[] {
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map(v => String(v).trim()).filter(Boolean);
  } else if (typeof raw === 'string') {
    list = raw
      .split(/\r?\n|,/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const c = canonicalizeConsultType(item);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** 기장·신고 → 온보딩 체크리스트·담당자 알림 대상 */
export function consultTypesNeedOnboardingChecklist(types: string[]): boolean {
  return types.some(t => {
    const c = canonicalizeConsultType(t);
    return c === BOOKKEEPING_CONSULT_TYPE || c === FILING_CONSULT_TYPE;
  });
}

/** 신고문의 전용 체크리스트 항목 */
export const FILING_CHECKLIST_KEYS = [
  'consent',
  'assignee',
  'programClient',
  'blueholeClient',
  'tpClient',
] as const;

/** 문의유형에 따라 보여줄 체크리스트 키 (기장 포함 시 전체) */
export function checklistKeysForConsultTypes(
  types: string[],
  allKeys: readonly string[],
): readonly string[] {
  const canon = types.map(canonicalizeConsultType);
  if (canon.includes(BOOKKEEPING_CONSULT_TYPE)) return allKeys;
  if (canon.includes(FILING_CONSULT_TYPE)) {
    return FILING_CHECKLIST_KEYS.filter(k => allKeys.includes(k));
  }
  return [];
}
