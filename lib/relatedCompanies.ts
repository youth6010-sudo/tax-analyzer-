/** 관계회사명 문자열 파싱/조인 (쉼표·전각·슬래시 등) */

export function parseRelatedNames(raw: string | null | undefined): string[] {
  return String(raw || '')
    .split(/[,，、;/|]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function joinRelatedNames(names: string[]): string {
  return [...new Set(names.map(n => n.trim()).filter(Boolean))].join(', ');
}

export function relatedNamesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = parseRelatedNames(a).slice().sort();
  const right = parseRelatedNames(b).slice().sort();
  if (left.length !== right.length) return false;
  return left.every((n, i) => n === right[i]);
}

/** 상호 매칭용 — 공백·㈜·주식회사 제거 */
export function companySoftKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/㈜/g, '')
    .replace(/\(주\)/g, '')
    .replace(/주식회사/g, '')
    .replace(/股份/g, '');
}
