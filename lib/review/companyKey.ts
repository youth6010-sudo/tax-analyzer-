/**
 * 검토표 · 수임처 · 워크벤치 공통 업체 연결 키
 * NFKC → 법인형태·공백·기호 제거 → lowercase
 */

const LEGAL_FORMS =
  /주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인|의료법인|사회복지법인|학교법인|영농조합법인|농업회사법인|협동조합/g;

const LEGAL_MARKERS = /㈜|㈐|㈎|\(주\)|\(유\)|\(재\)|\(사\)|\(의\)|\(학\)|\(농\)|（주）|（유）|（재）|（사）/gi;

const PUNCTUATION = /[\s()[\]{}<>.,·•\-_/\\'"`~!@#$%^&*+=|:;?（）]/g;

const BRANCH_SUFFIX = /(본점|지점|제\d+공장)$/;

function stripLegalForms(s: string): string {
  return s.replace(LEGAL_FORMS, '').replace(LEGAL_MARKERS, '');
}

function stripPunctuation(s: string): string {
  return s.replace(PUNCTUATION, '');
}

function stripBranchSuffix(s: string): string {
  const trimmed = s.replace(BRANCH_SUFFIX, '');
  return trimmed.length >= 4 ? trimmed : s;
}

function normalizeBase(name: string): string {
  let s = name.trim().normalize('NFKC');
  if (!s) return '';
  s = stripLegalForms(s);
  s = stripPunctuation(s);
  return s.toLowerCase();
}

export function companyLinkKey(name: string | null | undefined): string {
  if (name == null || name === '') return '';
  const base = normalizeBase(String(name));
  if (!base) return '';
  return stripBranchSuffix(base);
}

/** 매칭용 순수 상호 코어 (지점 접미사·잔여 기호 제거) */
export function coreCompanyKey(name: string | null | undefined): string {
  if (name == null || name === '') return '';
  let s = normalizeBase(String(name));
  if (!s) return '';
  s = stripBranchSuffix(s);
  s = s.replace(/[^a-z0-9가-힣]/g, '');
  return s;
}

export function hasCompanyLinkKey(name: string | null | undefined): boolean {
  return companyLinkKey(name).length > 0;
}

function labelVariants(label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);

  const withoutLegal = trimmed
    .replace(/\(주\)|（주）|㈜|주식회사|\(유\)|（유）/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (withoutLegal && withoutLegal !== trimmed.replace(/\s+/g, '')) {
    variants.add(withoutLegal);
  }

  if (!/\(주\)|（주）|㈜|주식회사/i.test(trimmed)) {
    variants.add(`(주)${trimmed}`);
    variants.add(`㈜${trimmed}`);
  }

  const inner = trimmed.match(/^\(주\)\s*(.+)$/i)?.[1]?.trim();
  if (inner) variants.add(inner);

  return [...variants];
}

/** 검토표 entry용 대체 키 목록 */
/** 담당자·성명 스코프 검토표 연결 키 */
export function scopedReviewKey(
  owner: string,
  baseKey: string,
  personName?: string | null,
): string {
  const base = baseKey.trim();
  if (!base) return '';
  const ownerPart = owner.trim();
  const personKey = personName ? companyLinkKey(personName) : '';
  if (ownerPart && personKey) return `${ownerPart}/${base}/${personKey}`;
  if (ownerPart) return `${ownerPart}/${base}`;
  if (personKey) return `${base}/${personKey}`;
  return base;
}

/** scoped 키에서 legacy 상호 키 추출 (`페리/abc/홍` → `abc`) */
export function legacyBaseKeyFromScopedReviewKey(scopedKey: string): string {
  const parts = scopedKey.split('/');
  if (parts.length >= 2) return parts[1];
  return scopedKey;
}

/** 검토표 연결 조회 키 — scoped(`담당/상호`)는 그대로, legacy는 상호 정규화 */
export function normalizeReviewLookupKey(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed;
  return companyLinkKey(trimmed);
}

export function buildAltLinkKeys(...labels: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    if (!label) continue;
    for (const variant of labelVariants(String(label))) {
      const key = companyLinkKey(variant);
      const core = coreCompanyKey(variant);
      if (key.length >= 2) out.add(key);
      if (core.length >= 2) out.add(core);
    }
  }
  return [...out];
}
