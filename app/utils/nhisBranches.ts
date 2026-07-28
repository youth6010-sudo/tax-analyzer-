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
  { id: 'nps', label: '국민연금', shortLabel: '연금', accent: 'indigo', note: '공개 데이터에 관할구역 없음 · 주소·지사명으로 검색' },
  { id: 'comwel', label: '근로복지(고용·산재)', shortLabel: '근로복지', accent: 'orange' },
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

/** 검색어 토큰이 기관명·주소·관할에 모두 포함되면 매칭 */
export function filterInsuranceBranches(
  branches: InsuranceBranch[],
  query: string,
  limit = 12,
): InsuranceBranch[] {
  const q = query.trim();
  if (q.length < 1) return [];

  const tokens = q
    .split(/[\s,./]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 1)
    .map(t => normalize(t));

  if (!tokens.length) return [];

  const scored: { branch: InsuranceBranch; score: number }[] = [];

  for (const b of branches) {
    const hay = normalize(
      `${b.shortName} ${b.name} ${b.address} ${b.jurisdiction} ${b.zip}`,
    );
    if (!tokens.every(t => hay.includes(t))) continue;

    let score = 0;
    const shortN = normalize(b.shortName);
    const jurisN = normalize(b.jurisdiction);
    const addrN = normalize(b.address);
    for (const t of tokens) {
      if (shortN.includes(t)) score += 8;
      if (jurisN.includes(t)) score += 6;
      if (addrN.includes(t)) score += 3;
      if (shortN.startsWith(t) || shortN.includes(`지사${t}`) || shortN.endsWith(`${t}지사`)) {
        score += 4;
      }
    }
    if (!b.jurisdiction && /본부|지역본부|상담센터|위원회/.test(b.shortName)) score -= 5;
    scored.push({ branch: b, score });
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
