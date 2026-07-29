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
  const raw = query
    .split(/[\s,./]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const adminTokens = raw.filter(t =>
    /[가-힣]+(특별자치도|특별자치시|광역시|특별시|자치시|자치도|시|군|구|동|읍|면|리)$/.test(t),
  );
  const orgTokens = raw.filter(t => /지사|본부|센터|위원회/.test(t));

  if (adminTokens.length || orgTokens.length) {
    return [...adminTokens, ...orgTokens];
  }

  return raw.filter(t => !/[0-9]/.test(t) && t.length >= 2);
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
        `${b.shortName} ${b.name} ${b.address} ${b.jurisdiction} ${b.zip} ${b.role || ''} ${b.hqName || ''} ${(b.departmentPhones ?? []).map(d => `${d.label} ${d.role || ''}`).join(' ')}`,
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
  return scored.slice(0, limit).map(s => s.branch);
}

/** @deprecated use filterInsuranceBranches */
export const filterNhisBranches = filterInsuranceBranches;
export type NhisBranch = InsuranceBranch;
export type NhisBranchDataset = InsuranceBranchDataset;
