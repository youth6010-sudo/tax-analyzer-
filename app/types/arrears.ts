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
  /** 공문 작성일 표시 (예: 2026.07.27). 비어 있으면 asOfDate 사용 */
  letterDate: string;
  source: string;
  updatedBy: string;
  updatedAt: string;
  /** 최근 청구(금액) 내역 요약 — 목록용 */
  reasonSummary?: string;
  /** 내역 미결합 = sum(amount − paidAmount). 없으면 0 */
  linesOpen?: number;
  /** 원장잔액 − 내역미결합. 0이면 일치 */
  balanceDiff?: number;
  /**
   * ok=일치, mismatch=잔액불일치, ledger_only=공문 없는 장기미수(원장 유지)
   */
  balanceDiffKind?: 'ok' | 'mismatch' | 'ledger_only';
  /** 연결 수임처가 유출(churned) 상태 */
  isChurned?: boolean;
};

export type ArrearsLetterLineSource =
  | 'letter'
  | 'ledger'
  | 'manual'
  | 'cms'
  | 'tax'
  | 'payment';

export type ArrearsLetterLineDto = {
  id: string;
  arrearsEntryId: string;
  sortOrder: number;
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  source: ArrearsLetterLineSource;
};

export type ArrearsLetterLineInput = {
  id?: string;
  description: string;
  amount: number;
  paidAmount?: number;
  paidDate?: string;
  source?: ArrearsLetterLineSource;
};

/** 공문 내역 누적 잔액 (= sum(amount - paidAmount)) */
export function letterBalanceFromLines(
  lines: Array<{ amount: number; paidAmount: number }>,
): number {
  return lines.reduce((sum, l) => sum + Math.round(l.amount) - Math.round(l.paidAmount || 0), 0);
}

/** 공문 표용 누적 잔액 배열 */
export function letterRunningBalances(
  lines: Array<{ amount: number; paidAmount: number }>,
): number[] {
  let run = 0;
  return lines.map(l => {
    run += Math.round(l.amount) - Math.round(l.paidAmount || 0);
    return run;
  });
}

/**
 * 전액 회수(누적 잔액 0) 이후의 신규 미수 사이클.
 * 아직 신규 미수가 없고 직전 사이클만 전액 회수된 경우 → 그 사이클(입력 이력)을 그대로 반환.
 * 편집/원장대사에는 전체 이력을 유지.
 */
export function linesForCurrentLetterCycle<T extends { amount: number; paidAmount: number }>(
  lines: T[],
): T[] {
  if (!lines.length) return lines;
  const running = letterRunningBalances(lines);
  let lastZero = -1;
  for (let i = 0; i < running.length; i++) {
    if (running[i] === 0) lastZero = i;
  }
  if (lastZero < 0) return lines;
  if (lastZero >= lines.length - 1) {
    // 마지막까지 0 → 직전 완료 사이클(입력했던 내역) 유지
    let prevZero = -1;
    for (let i = 0; i < lastZero; i++) {
      if (running[i] === 0) prevZero = i;
    }
    return lines.slice(prevZero + 1);
  }
  return lines.slice(lastZero + 1);
}

/** 0원 청산 후 재개 이력이 있어 「이전 내역」을 숨길 수 있는지 */
export function hasPriorClosedLetterCycle<T extends { amount: number; paidAmount: number }>(
  lines: T[],
): boolean {
  if (lines.length < 2) return false;
  return linesForCurrentLetterCycle(lines).length < lines.length;
}

/** asOfDate(YYYY-MM-DD) → 공문 일자 표기 2026.07.27 */
export function formatArrearsLetterDate(asOfOrLetter: string): string {
  const s = (asOfOrLetter || '').trim();
  if (!s) return '';
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return s;
}

/** 공문 작성일 — 미수관리 기준일(asOfDate)만 사용. 엑셀 letterDate는 표시에 쓰지 않음 */
export function resolveArrearsLetterAsOfDate(
  globalAsOfDate: string,
  item: { asOfDate?: string; letterDate?: string },
): string {
  return formatArrearsLetterDate(globalAsOfDate || item.asOfDate || '');
}

/** 지급일시 → 엑셀 공문과 같은 `M월 D일` (이미 한국어면 공백만 정규화) */
export function formatArrearsPaidDateKo(raw: string | number | Date | null | undefined): string {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getMonth() + 1}월 ${raw.getDate()}일`;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial (대략 1900~2200년)
    if (raw > 20000 && raw < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + Math.round(raw) * 86400000);
      if (!Number.isNaN(d.getTime())) return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
    }
    return '';
  }

  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // 20260116 → 1월 16일 (공문/엑셀용)
  const ymd8 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd8) return `${Number(ymd8[2])}월 ${Number(ymd8[3])}일`;

  // 이미 한국어: 07월 02일 / 7월 2일
  const ko = s.match(/^0?(\d{1,2})\s*월\s*0?(\d{1,2})\s*일$/);
  if (ko) return `${Number(ko[1])}월 ${Number(ko[2])}일`;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${Number(iso[2])}월 ${Number(iso[3])}일`;

  const dot = s.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (dot) return `${Number(dot[2])}월 ${Number(dot[3])}일`;

  const slash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) return `${Number(slash[2])}월 ${Number(slash[3])}일`;

  // 07/02, 7/2 (연도 없음 → 월/일)
  const md = s.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (md) return `${Number(md[1])}월 ${Number(md[2])}일`;

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(s)) {
    return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일`;
  }

  return s;
}

/** 오늘 지급일시 (한국어) */
export function todayArrearsPaidDateKo(now = new Date()): string {
  return `${now.getMonth() + 1}월 ${now.getDate()}일`;
}


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
 * 현황표 행 배경 (연한 톤 통일)
 * 채권회수: 연한 빨강 / 악성: 연한 주황 / 장기: 연한 노랑 / 일시: 연한 연두 / CMS: 연회색 / 미분류: 없음
 */
export function arrearsCategoryRowClass(id: string): string {
  switch (id) {
    case 'recovery':
      return 'bg-[#fecaca]';
    case 'bad':
      return 'bg-[#fed7aa]';
    case 'long':
      return 'bg-[#fef08a]';
    case 'temp':
      return 'bg-[#bbf7d0]';
    case 'cms':
      return 'bg-[#e5e7eb]';
    default:
      return 'bg-white';
  }
}

export function arrearsCategoryChipClass(id: string): string {
  switch (id) {
    case 'recovery':
      return 'bg-[#fecaca] text-slate-900 border-[#f87171]';
    case 'bad':
      return 'bg-[#fed7aa] text-slate-900 border-[#fb923c]';
    case 'long':
      return 'bg-[#fef08a] text-slate-900 border-[#eab308]';
    case 'temp':
      return 'bg-[#bbf7d0] text-slate-900 border-[#4ade80]';
    case 'cms':
      return 'bg-[#e5e7eb] text-slate-800 border-[#9ca3af]';
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
