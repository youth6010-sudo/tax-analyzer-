/** 미수 관리분류 */
export const ARREARS_MGMT_CATEGORIES = [
  { id: 'recovery', label: '채권회수', code: 0 },
  { id: 'bad', label: '악성', code: 1 },
  { id: 'long', label: '장기', code: 2 },
  { id: 'temp', label: '일시', code: 3 },
  { id: 'cms', label: 'CMS', code: 4 },
] as const;

export type ArrearsMgmtCategory = (typeof ARREARS_MGMT_CATEGORIES)[number]['id'] | '';

export const ARREARS_MANAGER_CODE_MAP: Record<number, string> = {
  1: '인디',
  2: '블루',
  3: '다야',
  4: '윈터',
  5: '리아',
  6: '페리',
};

export const ARREARS_MANAGER_NAMES = ['인디', '블루', '다야', '윈터', '리아', '페리'] as const;

export type ArrearsEntryDto = {
  id: string;
  clientId: string | null;
  externalCode: string;
  companyName: string;
  businessNo: string;
  representative: string;
  balance: number;
  carryIn: number;
  debit: number;
  credit: number;
  managerName: string;
  mgmtCategory: ArrearsMgmtCategory;
  cmsNote: string;
  memo: string;
  asOfDate: string;
  source: string;
  updatedBy: string;
  updatedAt: string;
};

export type ArrearsManagerTotal = {
  managerName: string;
  count: number;
  balance: number;
};

export function arrearsCategoryLabel(id: string): string {
  if (!id) return '—';
  const found = ARREARS_MGMT_CATEGORIES.find(c => c.id === id);
  return found?.label ?? id;
}

/**
 * 현황표 엑셀 배경색에 맞춤
 * 채권회수 #ffcc99 / 악성 #ffcc00 / 장기 #ffff00 / 일시·CMS 구분색
 * 미분류는 흰색
 */
export function arrearsCategoryRowClass(id: string): string {
  switch (id) {
    case 'recovery':
      return 'bg-[#ffcc99]';
    case 'bad':
      return 'bg-[#ffcc00]';
    case 'long':
      return 'bg-[#ffff66]';
    case 'temp':
      return 'bg-[#c5e1a5]';
    case 'cms':
      return 'bg-[#80deea]';
    default:
      return 'bg-white';
  }
}

export function arrearsCategoryChipClass(id: string): string {
  switch (id) {
    case 'recovery':
      return 'bg-[#ffcc99] text-slate-900 border-[#e6a86a]';
    case 'bad':
      return 'bg-[#ffcc00] text-slate-900 border-[#d4a800]';
    case 'long':
      return 'bg-[#ffff66] text-slate-900 border-[#d4d400]';
    case 'temp':
      return 'bg-[#c5e1a5] text-slate-900 border-[#8bc34a]';
    case 'cms':
      return 'bg-[#80deea] text-slate-900 border-[#26c6da]';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function arrearsCategoryFromCode(code: number | string | null | undefined): ArrearsMgmtCategory {
  const n = typeof code === 'string' ? Number(code) : code;
  if (n == null || Number.isNaN(n)) return '';
  const found = ARREARS_MGMT_CATEGORIES.find(c => c.code === n);
  return found?.id ?? '';
}

export function arrearsManagerFromCode(code: number | string | null | undefined): string {
  const n = typeof code === 'string' ? Number(code) : code;
  if (n == null || Number.isNaN(n)) return '';
  return ARREARS_MANAGER_CODE_MAP[n] ?? '';
}

export function formatArrearsWon(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.round(n));
}
