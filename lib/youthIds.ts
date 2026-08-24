/**
 * 청년들 ID — 회사 계정/계좌/자료 모음
 *
 * 실제 비밀번호·계좌번호 등 민감정보이므로 소스/깃에 두지 않는다.
 * 저장: DB app_config(youth_ids) — 포털에서 편집 가능.
 * 초기/백업: Vercel 환경변수 `YOUTH_IDS_JSON` (DB 비어 있을 때만 사용).
 *
 * 접근정책:
 *  - 회사 공인 IP(YOUTH_IDS_ALLOWED_IPS)에서만 페이지 열림
 *  - 로그인 닉네임(블루/다야/리아/윈터/페리/인디/찰리) 기준
 *    · owner 없음(공용/담당없음) → 전원 표시
 *    · owner === 내 닉네임 → 표시
 *    · owner === 다른 사람 → 숨김
 */

export type YouthIdField = {
  label: string;
  value: string;
  /** ID·비밀번호·전화 등 민감 필드 (기본 가림 + 보기 토글) */
  secret?: boolean;
};

export type YouthIdEntry = {
  id: string;
  title: string;
  /** 담당 닉네임. 없으면 공용(담당없음) */
  owner?: string | null;
  url?: string;
  note?: string;
  fields: YouthIdField[];
};

export type YouthIdCategory = {
  id: string;
  label: string;
  icon?: string;
  entries: YouthIdEntry[];
};

export type YouthIdDoc = {
  categories: YouthIdCategory[];
};

const EMPTY: YouthIdDoc = { categories: [] };

export function loadYouthIds(): YouthIdDoc {
  const raw = process.env.YOUTH_IDS_JSON;
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as YouthIdDoc;
    if (!parsed || !Array.isArray(parsed.categories)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

/** 로그인 사용자(닉네임) 기준 내 것 + 공용만 남기고, 빈 카테고리는 제거 */
export function visibleForUser(doc: YouthIdDoc, nickname: string): YouthIdCategory[] {
  return doc.categories
    .map(cat => ({
      ...cat,
      entries: (cat.entries ?? []).filter(e => !e.owner || e.owner === nickname),
    }))
    .filter(cat => cat.entries.length > 0);
}

export function isConfigured(): boolean {
  return Boolean(process.env.YOUTH_IDS_JSON);
}
