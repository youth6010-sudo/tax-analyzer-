/** 총수입·필요경비 명세 / 상세분석 공통 (전기·당기 예상 등) */

export const EXPENSE_ITEMS = [
  { key: 'costOfGoods', label: '매출원가', hint: '상품·제품원가' },
  { key: 'labor', label: '노무비', hint: '' },
  { key: 'expenses', label: '경비', hint: '' },
  { key: 'salary', label: '급여', hint: '급여·임금·제수당' },
  { key: 'taxPublic', label: '제세공과금', hint: '' },
  { key: 'rent', label: '임차료', hint: '' },
  { key: 'interest', label: '지급이자', hint: '' },
  { key: 'entertainment', label: '기업업무추진비', hint: '' },
  { key: 'donation', label: '기부금', hint: '' },
  { key: 'depreciation', label: '감가상각비', hint: '' },
  { key: 'vehicle', label: '차량유지비', hint: '' },
  { key: 'commission', label: '지급수수료', hint: '' },
  { key: 'supplies', label: '소모품비', hint: '' },
  { key: 'welfare', label: '복리후생비', hint: '' },
  { key: 'freight', label: '운반비', hint: '' },
  { key: 'advertising', label: '광고선전비', hint: '' },
  { key: 'travel', label: '여비교통비', hint: '' },
  { key: 'other', label: '기타', hint: '' },
] as const;

export type ExpenseMap = Record<string, string>;

export interface CustomExpenseDef {
  id: string;
  label: string;
}

export interface RowDetail {
  show: boolean;
  expenses: ExpenseMap;
  customDefs: CustomExpenseDef[];
}

export const customExpenseKey = (id: string) => `c_${id}`;

export const initExpenses = (): ExpenseMap =>
  Object.fromEntries(EXPENSE_ITEMS.map(i => [i.key, ''])) as ExpenseMap;

export function mergeDetailExpenses(raw: RowDetail | undefined): ExpenseMap {
  const base = initExpenses();
  if (!raw) return base;
  const merged = { ...base, ...raw.expenses };
  for (const c of raw.customDefs ?? []) {
    const k = customExpenseKey(c.id);
    if (merged[k] === undefined) merged[k] = '';
  }
  return merged;
}

export function sumExpenseInputs(detail: RowDetail, toNum: (v: string | undefined) => number): number {
  let s = 0;
  for (const i of EXPENSE_ITEMS) s += toNum(detail.expenses[i.key]);
  for (const c of detail.customDefs ?? []) s += toNum(detail.expenses[customExpenseKey(c.id)]);
  return s;
}
