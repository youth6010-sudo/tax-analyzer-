// 블루홀 미연결 수임처 자동 연결.
//   - 블루홀 거래처 전체 목록을 한 번만 받아 색인을 만들고
//   - 사업자번호(10자리) 정확 일치 → 상호 정규화 일치 순으로 매칭한다.
//   - 유일하게 일치할 때만 자동 연결하고, 여러 후보가 있으면 수동 선택용으로 남긴다.
import { withBluehole } from './server';
import * as bh from './core.js';
import { setClientBlueholeId } from '@/lib/clientsDb';
import { insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import { listBlueholeUnlinkedClients, type BlueholeUnlinkedClient } from '@/lib/blueholeUnlinkedDb';

export interface BhCandidate {
  id: string;
  name: string;
  business_number: string;
  branch_name: string;
}

export interface AutoLinkLinked extends BlueholeUnlinkedClient {
  blueholeClientId: string;
  blueholeName: string;
  matchedBy: 'biz' | 'name';
}

export interface AutoLinkRemaining extends BlueholeUnlinkedClient {
  reason: 'no_match' | 'ambiguous';
  candidates: BhCandidate[];
}

export interface AutoLinkResult {
  total: number;
  linked: AutoLinkLinked[];
  remaining: AutoLinkRemaining[];
}

/** 상호 정규화 — (주)/주식회사 등 법인형태 표기·공백·기호 제거 후 소문자화 */
export function normalizeCompanyName(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  s = s
    .replace(
      /주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인|의료법인|사회복지법인|학교법인|영농조합법인|농업회사법인|협동조합/g,
      '',
    )
    .replace(/㈜|㈐|㈎|\(주\)|\(유\)|\(재\)|\(사\)|\(의\)|\(학\)|\(농\)/g, '');
  s = s.replace(/[\s()[\]{}<>.,·•\-_/\\'"`~!@#$%^&*+=|:;?]/g, '');
  return s.toLowerCase();
}

const bizDigits = (v: string) => (v || '').replace(/\D/g, '');

type BhRow = { id: string; name: string; aka?: string; business_number?: string; branch_name?: string };

function toCandidate(c: BhRow): BhCandidate {
  return {
    id: c.id,
    name: c.name || '',
    business_number: c.business_number || '',
    branch_name: c.branch_name || '',
  };
}

/**
 * 미연결 수임처를 블루홀 거래처와 자동 연결한다.
 * @param userId 블루홀 자격증명을 사용할 사용자(보통 관리자)
 * @param userName 로그 기록용 이름
 */
export async function autoLinkUnlinkedClients(userId: string, userName: string): Promise<AutoLinkResult> {
  const unlinked = await listBlueholeUnlinkedClients();

  // 블루홀 거래처 전체 목록(내 계정 권한 범위)
  const all = (await withBluehole(userId, (cookie) => bh.listClients(cookie, { limit: 3000 }))) as BhRow[];

  const byBiz = new Map<string, BhRow[]>();
  const byName = new Map<string, BhRow[]>();
  for (const c of all) {
    const biz = bizDigits(c.business_number || '');
    if (biz.length === 10) {
      const arr = byBiz.get(biz) ?? [];
      arr.push(c);
      byBiz.set(biz, arr);
    }
    for (const nm of [c.name, c.aka]) {
      const key = normalizeCompanyName(nm || '');
      if (key.length >= 2) {
        const arr = byName.get(key) ?? [];
        arr.push(c);
        byName.set(key, arr);
      }
    }
  }

  const linked: AutoLinkLinked[] = [];
  const remaining: AutoLinkRemaining[] = [];

  for (const client of unlinked) {
    const biz = bizDigits(client.businessNo);
    let matches: BhRow[] = [];
    let matchedBy: 'biz' | 'name' | null = null;

    if (biz.length === 10 && byBiz.has(biz)) {
      matches = byBiz.get(biz)!;
      matchedBy = 'biz';
    } else {
      const key = normalizeCompanyName(client.companyName);
      if (key.length >= 2 && byName.has(key)) {
        matches = byName.get(key)!;
        matchedBy = 'name';
      }
    }

    // 같은 블루홀 ID 중복 후보 정리
    const uniq = new Map<string, BhRow>();
    for (const m of matches) if (!uniq.has(m.id)) uniq.set(m.id, m);
    const uniqMatches = [...uniq.values()];

    if (matchedBy && uniqMatches.length === 1) {
      const bhRow = uniqMatches[0];
      await setClientBlueholeId(client.id, bhRow.id);
      await insertBlueholeSyncLog({
        clientId: client.id,
        blueholeClientId: bhRow.id,
        action: 'link',
        userId,
        userName: userName || '',
        changes: { name: bhRow.name || '' },
        successCols: [],
        warnings: [matchedBy === 'biz' ? '자동연결(사업자번호)' : '자동연결(상호)'],
      }).catch(() => {});
      linked.push({
        ...client,
        blueholeClientId: bhRow.id,
        blueholeName: bhRow.name || '',
        matchedBy,
      });
    } else {
      remaining.push({
        ...client,
        reason: uniqMatches.length > 1 ? 'ambiguous' : 'no_match',
        candidates: uniqMatches.slice(0, 8).map(toCandidate),
      });
    }
  }

  return { total: unlinked.length, linked, remaining };
}
