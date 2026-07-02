/** 수임처 상세 — 메인 영역 vs 한줄 상세 구분 */

import { DOUZONE_FIELD_LABELS, DOUZONE_TAX_FLAG_LABELS } from '@/app/config/douzoneFields';

export const MAIN_META_INTAKE_KEYS = [
  'douzoneCode',
  'category',
  'address',
  'industry',
  'item',
  'industryCode',
] as const;

export const MAIN_META_LABELS: Record<string, string> = {
  douzoneCode: '세무사랑 코드',
  category: '대분류',
  address: '주소',
  industry: '업태',
  item: '종목',
  industryCode: '업종코드',
  ...Object.fromEntries(
    Object.entries(DOUZONE_FIELD_LABELS).filter(([k]) =>
      !MAIN_META_INTAKE_KEYS.includes(k as (typeof MAIN_META_INTAKE_KEYS)[number]),
    ),
  ),
};

export const TAX_FLAG_KEYS = Object.keys(DOUZONE_TAX_FLAG_LABELS);

export const DETAIL_SKIP_KEYS = new Set([
  'notes',
  'taxFlags',
  'mobilePhone',
  'payrollHistory',
  'noticeData',
  'withholdingSettings',
  'incomeTypes',
  'yearEndTypes',
  ...MAIN_META_INTAKE_KEYS,
]);

export function mainMetaEntries(intakeData: Record<string, unknown>): { key: string; label: string; value: string }[] {
  return MAIN_META_INTAKE_KEYS.map(key => ({
    key,
    label: MAIN_META_LABELS[key] ?? key,
    value: String(intakeData[key] ?? '').trim(),
  })).filter(e => e.value);
}

export function detailLineEntries(
  intakeData: Record<string, unknown>,
  extras?: { program?: string; feeSummary?: number | null },
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (extras?.feeSummary != null && extras.feeSummary > 0) {
    rows.push({ label: '기장료', value: extras.feeSummary.toLocaleString('ko-KR') });
  }
  if (extras?.program?.trim()) rows.push({ label: '프로그램', value: extras.program.trim() });

  for (const [key, label] of Object.entries(DOUZONE_FIELD_LABELS)) {
    if (DETAIL_SKIP_KEYS.has(key)) continue;
    const value = String(intakeData[key] ?? '').trim();
    if (value) rows.push({ label, value });
  }

  for (const key of Object.keys(intakeData)) {
    if (DETAIL_SKIP_KEYS.has(key)) continue;
    if (DOUZONE_FIELD_LABELS[key]) continue;
    const value = String(intakeData[key] ?? '').trim();
    if (value) rows.push({ label: key, value });
  }

  return rows;
}
