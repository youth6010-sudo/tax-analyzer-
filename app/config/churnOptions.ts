export const DATA_CLEANUP_OPTIONS = ['폐업', '이전', '법인전환', '신고대리 전환'] as const;

export const CHURN_TYPE_OPTIONS = ['폐업', '경영악화', '서비스불만족', '기타'] as const;

export const EARLY_SIGN_ITEMS = [
  '연락 빈도 하락',
  '대표님의 불만족 표출',
  '확인 불가',
  '기존 경리직원이 업무 협조하여 함께 진행하기로 하였으나 너무 바빠서 협조가 잘 이루어지지 않음.',
  '회사 환경 자체가 불안정한 요인이 있었음/ 합병 등 목전에 두고 정리가 안됨',
  '사업자단위 과세를 진행하는곳으로 지점이 많은데 프로젝트 구분이나 이런부분들이 원할하지 않았음',
] as const;

export const REASON_ITEMS = [
  '다른 서비스를 찾음(모든것을 스크레핑 후 확인 할 수 있는 서비스)',
  '집중 관리 미흡 (내부 관리자기 있는경우 관리의 중요성이 올라감)',
  '경영악화로 인해 서비스 유지 X',
  '경리직원 2명이 너무바빠서 업무분장 협의 한 대로 진행이 되질 않음.',
  '합병관련하여 미팅후 진행하기로 하였으나 합병 무산되었고 , 서비스 종료 요청 들어옴',
  '갑자기 회사 상황 안좋아 지면서 자금경색 빠짐',
] as const;

export function parseCheckboxValue(raw: string, options: readonly string[]): string[] {
  if (!raw.trim()) return [];
  const parts = raw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  return options.filter(o => parts.includes(o));
}

export function joinCheckboxValue(selected: string[]): string {
  return selected.filter(Boolean).join(', ');
}

export function parseNumberedItems(raw: string): Set<number> {
  const set = new Set<number>();
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^(\d+)\./);
    if (m) set.add(Number(m[1]));
  }
  return set;
}

export function buildNumberedItems(items: readonly string[], selected: Set<number>): string {
  const lines: string[] = [];
  items.forEach((text, i) => {
    if (selected.has(i + 1)) lines.push(`${i + 1}. ${text}`);
  });
  return lines.join('\n');
}

export function toggleNumberedItem(
  current: string,
  items: readonly string[],
  index: number,
): string {
  const selected = parseNumberedItems(current);
  const n = index + 1;
  if (selected.has(n)) selected.delete(n);
  else selected.add(n);
  return buildNumberedItems(items, selected);
}

export function isNumberedItemChecked(raw: string, index: number): boolean {
  return parseNumberedItems(raw).has(index + 1);
}
