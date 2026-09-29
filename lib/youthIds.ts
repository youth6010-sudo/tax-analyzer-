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
 *    · owner === 다른 사람 → 숨김 ('전체보기'로 전원 조회 가능)
 */
import { managerNamesMatch } from '@/app/utils/managerMatch';

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

/** 전 항목 수정 권한 */
export const YOUTH_IDS_EDITORS = ['리아', '찰리', '페리', '인디'] as const;

export function canEditAllYouthIds(nickname: string): boolean {
  return YOUTH_IDS_EDITORS.some(n => managerNamesMatch(nickname, n));
}

function isVisibleEntry(e: YouthIdEntry, nickname: string): boolean {
  return !e.owner || e.owner === nickname;
}

/** 로그인 사용자(닉네임) 기준 내 것 + 공용만 남기고, 빈 카테고리는 제거 */
export function visibleForUser(doc: YouthIdDoc, nickname: string): YouthIdCategory[] {
  return doc.categories
    .map(cat => ({
      ...cat,
      entries: (cat.entries ?? []).filter(e => isVisibleEntry(e, nickname)),
    }))
    .filter(cat => cat.entries.length > 0);
}

/**
 * PUT 병합
 * - 일반 직원: 본인 항목만 추가·수정·삭제. 공용·타인 항목은 기존 그대로, 새 항목은 본인 명의
 * - 전체 편집 권한: 화면에 안 보이던(타인) 항목은 유지하고 보이던 항목만 교체(담당 변경 허용).
 *   전체보기(fullView)에서 저장할 때만 incoming 통째 저장
 */
export function mergeYouthIdDocForUser(
  existing: YouthIdDoc,
  incoming: YouthIdDoc,
  nickname: string,
  canEditAll: boolean,
  fullView = false,
): YouthIdDoc {
  if (canEditAll && fullView) return incoming;

  const incomingById = new Map(incoming.categories.map(c => [c.id, c]));
  const incomingEntryIds = new Set(
    incoming.categories.flatMap(c => (c.entries ?? []).map(e => e.id)),
  );
  const lockedIds = new Set(
    existing.categories.flatMap(c =>
      (c.entries ?? []).filter(e => e.owner !== nickname).map(e => e.id),
    ),
  );
  const acceptIncoming = (entries: YouthIdEntry[]) =>
    canEditAll
      ? entries
      : entries
          .filter(e => !lockedIds.has(e.id) && (!e.owner || e.owner === nickname))
          .map(e => ({ ...e, owner: nickname }));
  const result: YouthIdCategory[] = [];
  const seen = new Set<string>();

  for (const cat of existing.categories) {
    seen.add(cat.id);
    const inc = incomingById.get(cat.id);
    const isKept = (e: YouthIdEntry) =>
      canEditAll
        ? !isVisibleEntry(e, nickname) && !incomingEntryIds.has(e.id)
        : e.owner !== nickname;
    const editable = new Map(acceptIncoming(inc?.entries ?? []).map(e => [e.id, e]));
    const entries: YouthIdEntry[] = [];
    for (const e of cat.entries ?? []) {
      if (isKept(e)) entries.push(e);
      else if (editable.has(e.id)) {
        entries.push(editable.get(e.id)!);
        editable.delete(e.id);
      }
    }
    entries.push(...editable.values());
    result.push({
      id: cat.id,
      label: (canEditAll && inc?.label?.trim()) || cat.label,
      icon: canEditAll ? (inc?.icon ?? cat.icon) : cat.icon,
      entries,
    });
  }

  for (const cat of incoming.categories) {
    if (seen.has(cat.id)) continue;
    const entries = acceptIncoming(cat.entries ?? []);
    result.push({
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
      entries,
    });
  }

  return { categories: result };
}

export function isConfigured(): boolean {
  return Boolean(process.env.YOUTH_IDS_JSON);
}

export function newYouthIdEntryId(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .slice(0, 24);
  return `entry-${slug || 'new'}-${Date.now().toString(36)}`;
}

export function newYouthIdCategoryId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .slice(0, 24);
  return `cat-${slug || 'new'}-${Date.now().toString(36)}`;
}
