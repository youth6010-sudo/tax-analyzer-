export type InsuranceBranch = {
  id: string;
  name: string;
  shortName: string;
  address: string;
  zip: string;
  phone: string;
  fax?: string;
  jurisdiction: string;
  hours?: string;
  role?: string;
  hqName?: string;
  sourceUrl?: string;
  departmentPhones?: { label: string; phone: string; fax?: string; role?: string }[];
};

export type InsuranceBranchDataset = {
  source: string;
  updated: string;
  branches: InsuranceBranch[];
};

export type InsuranceOrgId = 'nhis' | 'nps' | 'comwel';

export const INSURANCE_ORGS: {
  id: InsuranceOrgId;
  label: string;
  shortLabel: string;
  accent: 'blue' | 'indigo' | 'orange';
  note?: string;
}[] = [
  { id: 'nhis', label: '건강보험', shortLabel: '건보', accent: 'blue' },
  { id: 'nps', label: '국민연금', shortLabel: '연금', accent: 'indigo' },
  { id: 'comwel', label: '근로복지(고용·산재)', shortLabel: '근로복지', accent: 'orange' },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function tokenVariants(token: string): string[] {
  const base = normalize(token);
  const out = new Set<string>();
  if (!base) return [];
  out.add(base);

  const suffixes = [
    '특별자치도',
    '특별자치시',
    '광역시',
    '특별시',
    '자치시',
    '자치도',
    '시',
    '도',
    '군',
    '구',
    '동',
    '읍',
    '면',
    '리',
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const value of [...out]) {
      for (const suffix of suffixes) {
        if (value.length > suffix.length + 1 && value.endsWith(suffix)) {
          const next = value.slice(0, -suffix.length);
          if (!out.has(next)) {
            out.add(next);
            changed = true;
          }
        }
      }
    }
  }

  return [...out].sort((a, b) => b.length - a.length);
}

function extractQueryTokens(query: string): string[] {
  const cleaned = query
    .replace(/\([^)]*\)/g, m => ` ${m.slice(1, -1)} `)
    .replace(/[0-9]+(?:호|층|번길|길|로)/g, ' ')
    .replace(/[,./()]/g, ' ');

  const raw = cleaned
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);

  const adminTokens = raw.filter(t =>
    /[가-힣]+(특별자치도|특별자치시|광역시|특별시|자치시|자치도|시|군|구|동|읍|면|리)$/.test(t),
  );
  const orgTokens = raw.filter(t => /지사|본부|센터|위원회/.test(t));

  if (adminTokens.length || orgTokens.length) {
    // 주소형 검색은 시·구 단위를 우선하고, 동은 보조 매칭에만 씀
    const primary = adminTokens.filter(t => !/(동|읍|면|리)$/.test(t));
    return [...(primary.length ? primary : adminTokens), ...orgTokens];
  }

  return raw.filter(t => !/[0-9]/.test(t) && t.length >= 2);
}

function isAddressLikeQuery(query: string): boolean {
  return /[가-힣]+(특별자치도|특별자치시|광역시|특별시|시|군|구)/.test(query);
}

/** 검색어 토큰이 기관명·주소·관할에 모두 포함되면 매칭 */
export function filterInsuranceBranches(
  branches: InsuranceBranch[],
  query: string,
  limit = 12,
): InsuranceBranch[] {
  const q = query.trim();
  if (q.length < 1) return [];

  const tokenGroups = extractQueryTokens(q)
    .map(tokenVariants)
    .filter(group => group.length > 0);

  if (!tokenGroups.length) return [];

  function collectScored(groups: string[][]) {
    const scored: { branch: InsuranceBranch; score: number }[] = [];
    for (const b of branches) {
      const hay = normalize(
        `${b.shortName} ${b.name} ${b.address} ${b.jurisdiction} ${b.zip} ${b.role || ''} ${b.hqName || ''}`,
      );
      if (!groups.every(group => group.some(t => hay.includes(t)))) continue;

      let score = 0;
      const shortN = normalize(b.shortName);
      const jurisN = normalize(b.jurisdiction);
      const addrN = normalize(b.address);
      for (const group of groups) {
        const t = group.find(value => shortN.includes(value) || jurisN.includes(value) || addrN.includes(value)) ?? group[0];
        if (shortN.includes(t)) score += 8;
        if (jurisN.includes(t)) score += 6;
        if (addrN.includes(t)) score += 3;
        if (shortN.startsWith(t) || shortN.includes(`지사${t}`) || shortN.endsWith(`${t}지사`)) {
          score += 4;
        }
      }
      if (!b.jurisdiction && /본부|지역본부|상담센터|위원회/.test(b.shortName)) score -= 5;
      if (/본부|지역본부|위원회/.test(b.shortName) && !/본부|지역본부|위원회/.test(q)) score -= 4;
      if (/연구원|업무상질병판정위원회|특수형태근로종사자센터|종합센터/.test(b.shortName)) score -= 8;
      if (/센터/.test(b.shortName) && !/지사|출장소/.test(b.shortName) && !/센터/.test(q)) score -= 3;
      if (/지사|출장소/.test(b.shortName)) score += 2;
      scored.push({ branch: b, score });
    }
    return scored;
  }

  let scored = collectScored(tokenGroups);
  if (!scored.length && tokenGroups.length >= 2) {
    scored = collectScored(tokenGroups.slice(0, -1));
  }

  scored.sort(
    (a, b) => b.score - a.score || a.branch.shortName.localeCompare(b.branch.shortName, 'ko'),
  );

  // 주소형 검색은 관할이 맞는 최상위 지사만 (동점만 최대 2개)
  const effectiveLimit = isAddressLikeQuery(q) ? Math.min(limit, 2) : limit;
  if (!scored.length) return [];
  const best = scored[0].score;
  const tight = scored.filter(s => s.score >= best - (isAddressLikeQuery(q) ? 0 : 2));
  return tight.slice(0, effectiveLimit).map(s => s.branch);
}

/** 실제 전화번호만 추출 — 한글 업무문구는 제외, 15xx 고객센터 포함 */
export function formatContactNumberRanges(value?: string): string[] {
  const text = String(value || '').trim();
  if (!text || text === '-') return [];
  if (/[가-힣]/.test(text)) return [];

  const local = text.match(/\d{2,4}-\d{3,4}-\d{4}/g) ?? [];
  const hotline = text.match(/\b(?:15|16|18)\d{2}-\d{4}\b/g) ?? [];
  const matches = [...new Set([...local, ...hotline])];
  if (!matches.length) {
    const digits = text.replace(/\D/g, '');
    if (/^(?:15|16|18)\d{6}$/.test(digits)) return [text];
    if (/^0\d{8,10}$/.test(digits)) return [text];
    return [];
  }

  type Parsed = { raw: string; prefix: string | null; last: number | null };
  const parsed: Parsed[] = matches.map(n => {
    const m = n.match(/^(\d{2,4}-\d{3,4})-(\d{4})$/);
    return m ? { raw: n, prefix: m[1], last: Number(m[2]) } : { raw: n, prefix: null, last: null };
  });

  const byPrefix = new Map<string, Parsed[]>();
  const others: string[] = [];
  for (const item of parsed) {
    if (!item.prefix || item.last == null) {
      others.push(item.raw);
      continue;
    }
    const list = byPrefix.get(item.prefix) ?? [];
    list.push(item);
    byPrefix.set(item.prefix, list);
  }

  const out: string[] = [];
  for (const [prefix, items] of byPrefix) {
    items.sort((a, b) => (a.last ?? 0) - (b.last ?? 0));
    let start = items[0];
    let prev = items[0];
    const flush = () => {
      if (start.last === prev.last) out.push(start.raw);
      else {
        out.push(
          `${prefix}-${String(start.last).padStart(4, '0')}~${String(prev.last).padStart(4, '0')}`,
        );
      }
    };
    for (let i = 1; i < items.length; i += 1) {
      const cur = items[i];
      if ((cur.last ?? 0) === (prev.last ?? 0) + 1) {
        prev = cur;
        continue;
      }
      flush();
      start = cur;
      prev = cur;
    }
    flush();
  }

  return [...out, ...others];
}

export type InsuranceDeptContact = NonNullable<InsuranceBranch['departmentPhones']>[number];

/** 연락처 필터 모드: 세무 추천 / 업무별 / 전체 */
export type ContactPurposeId = 'recommend' | 'qualification' | 'premium' | 'main' | 'all';

export const CONTACT_PURPOSE_CHIPS: {
  id: ContactPurposeId;
  label: string;
}[] = [
  { id: 'recommend', label: '추천' },
  { id: 'qualification', label: '자격·가입' },
  { id: 'premium', label: '보험료·징수' },
  { id: 'all', label: '전체' },
];

const PURPOSE_KEYWORDS: Record<
  Exclude<ContactPurposeId, 'recommend' | 'all'>,
  Record<InsuranceOrgId, string[]>
> = {
  qualification: {
    nhis: ['자격', '취득', '상실', '피부양', '사업장', '자격징수', '가입'],
    nps: ['가입지원', '자격', '가입'],
    comwel: ['가입지원', '자격', '사업장', '가입'],
  },
  premium: {
    nhis: ['보험료', '징수', '부과', '고지', '자격징수'],
    nps: ['징수', '보험료', '부과'],
    comwel: ['보험료', '징수', '부과'],
  },
  main: {
    nhis: ['지사장', '대표', '고객센터', '총괄'],
    nps: ['지사장', '대표', '고객센터', '총괄'],
    comwel: ['지사장', '대표', '고객센터', '총괄'],
  },
};

const DEMOTE_PATTERN =
  /행정지원|시설|총무|재물|구매|기록물|사회공헌|재활보상|행복노후|장애인|노후준비|산재의학|복지사업|부정수급|송무|\bTF\b|특고/;

const BOOST_QUAL = /자격|취득|상실|피부양|사업장|자격징수|가입지원/;
const BOOST_PREMIUM = /보험료|징수|부과|고지/;
const BOOST_MAIN = /지사장|대표|고객센터/;

function contactHay(item: InsuranceDeptContact): string {
  return `${item.label || ''} ${item.role || ''}`;
}

export function hasVisibleContact(item: { phone?: string; fax?: string }): boolean {
  return formatContactNumberRanges(item.phone).length > 0 || formatContactNumberRanges(item.fax).length > 0;
}

function matchesKeywords(hay: string, keywords: string[]): boolean {
  return keywords.some(k => hay.includes(k));
}

/** 업무 칩에 맞는 부서 연락처만 필터 */
export function filterContactsByPurpose(
  contacts: InsuranceDeptContact[],
  org: InsuranceOrgId,
  purposeId: ContactPurposeId,
): InsuranceDeptContact[] {
  const visible = contacts.filter(hasVisibleContact);
  if (purposeId === 'all' || purposeId === 'recommend') return visible;
  const keywords = PURPOSE_KEYWORDS[purposeId][org];
  return visible.filter(item => matchesKeywords(contactHay(item), keywords));
}

/** 세무 실무 추천용 점수 — 자격·가입·보험료 가산, 행정/재활 등 감점 */
export function scoreContactForOffice(item: InsuranceDeptContact, _org: InsuranceOrgId): number {
  const hay = contactHay(item);
  let score = formatContactNumberRanges(item.phone).length ? 4 : 0;
  if (BOOST_QUAL.test(hay)) score += 10;
  if (BOOST_PREMIUM.test(hay)) score += 8;
  if (/가입지원/.test(hay)) score += 6;
  if (BOOST_MAIN.test(hay)) score += 2;
  if (DEMOTE_PATTERN.test(hay)) score -= 12;
  if (/센터/.test(hay) && !/가입지원|자격징수/.test(hay)) score -= 3;
  // 팀장·부장 등 총괄 라인 약간 가산 (실무 창구)
  if (/부장|팀장|총괄/.test(hay) && (BOOST_QUAL.test(hay) || BOOST_PREMIUM.test(hay))) score += 2;
  return score;
}

/** 추천 태그(자격 / 보험료 / 안내) */
export function contactPurposeTags(item: InsuranceDeptContact): string[] {
  const hay = contactHay(item);
  const tags: string[] = [];
  if (BOOST_QUAL.test(hay) || /가입지원/.test(hay)) tags.push('자격');
  if (BOOST_PREMIUM.test(hay)) tags.push('보험료');
  if (BOOST_MAIN.test(hay) && tags.length === 0) tags.push('안내');
  return tags;
}

/** 세무 업무 추천 순으로 정렬 (기본 상위 노출용) */
export function rankContactsForOffice(
  contacts: InsuranceDeptContact[],
  org: InsuranceOrgId,
): InsuranceDeptContact[] {
  return [...contacts.filter(hasVisibleContact)].sort((a, b) => {
    const diff = scoreContactForOffice(b, org) - scoreContactForOffice(a, org);
    if (diff !== 0) return diff;
    return contactHay(a).localeCompare(contactHay(b), 'ko');
  });
}

/** @deprecated use filterInsuranceBranches */
export const filterNhisBranches = filterInsuranceBranches;
export type NhisBranch = InsuranceBranch;
export type NhisBranchDataset = InsuranceBranchDataset;
