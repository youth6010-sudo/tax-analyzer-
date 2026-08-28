/**
 * 공문 ↔ 원장 상호 매칭 유틸 (이름 유사도·키 정규화)
 */
import { normCompanyName } from '@/lib/arrearsLetterDb';

export function softCompanyKey(s: string): string {
  return normCompanyName(s).replace(/원/g, '');
}

/**
 * 자동연결용 키 — 지점·대표자 등 **끝쪽** 괄호만 제거한 뒤 softCompanyKey.
 * `(주)` / `(유)` 법인격은 유지.
 */
export function matchCompanyKey(s: string): string {
  let t = String(s || '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/유한회사/g, '(유)');
  t = t.replace(/\(주\)/g, '\u0001주\u0001').replace(/\(유\)/g, '\u0001유\u0001');
  t = t.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '');
  t = t.replace(/\u0001주\u0001/g, '(주)').replace(/\u0001유\u0001/g, '(유)');
  return softCompanyKey(t);
}

export function isLedgerRefDescription(desc: string, source?: string): boolean {
  const d = String(desc || '');
  if (
    d.includes('원장반영') ||
    d.includes('원장 추가미수') ||
    d.includes('원장 입금') ||
    d.includes('원장 잔액') ||
    /^전기이월/.test(d)
  ) {
    return true;
  }
  return source === 'ledger';
}

/** 0~1, 높을수록 비슷 */
export function companyNameSimilarity(a: string, b: string): number {
  const ka = softCompanyKey(a);
  const kb = softCompanyKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.includes(kb) || kb.includes(ka)) {
    const shorter = Math.min(ka.length, kb.length);
    const longer = Math.max(ka.length, kb.length);
    return 0.72 + 0.28 * (shorter / longer);
  }
  const grams = (s: string) => {
    const set = new Set<string>();
    if (s.length < 2) {
      set.add(s);
      return set;
    }
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = grams(ka);
  const B = grams(kb);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}
