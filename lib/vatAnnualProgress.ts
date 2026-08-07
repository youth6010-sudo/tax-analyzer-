import type { ClientRecord } from '@/app/types/client';
import {
  mergeVatPeriodProgressPatch,
  readVatPeriodProgress,
  vatProgressPeriodKey,
  type VatPeriodProgress,
  type VatProgressCell,
} from '@/lib/vatEntryProgress';
import { VAT_PHASES, type VatPhase } from '@/app/utils/filingCheck';

/** 연간진행표 — 가결산·보고서·원천분개·통장 분기 체크 */
export type VatAnnualYearState = {
  preliminaryReport?: boolean;
  /** 가결산 완료 체크한 날 */
  preliminaryReportDate?: string;
  /** 가결산 완료예정일 */
  preliminaryReportDueDate?: string;
  /** 가결산 미팅일정 (날짜 YYYY-MM-DD) */
  preliminaryMeetingDate?: string;
  /** 가결산 미팅 시각 HH:mm */
  preliminaryMeetingTime?: string;
  /** face=대면(캘린더 등록) | call=통화 */
  preliminaryMeetingMode?: 'face' | 'call' | '';
  /** 대면 미팅 연동 개인 체크리스트 ID */
  preliminaryMeetingEventId?: string;
  /** 가결산 완료예정일 경과 상기 할일 ID */
  preliminaryReportDueEventId?: string;
  /** 보고서 완료 */
  report?: boolean;
  /** 보고서 완료 체크한 날 */
  reportDate?: string;
  /** 보고서 완료예정일 */
  reportDueDate?: string;
  /** 보고서 미팅일정 (날짜) */
  reportMeetingDate?: string;
  /** 보고서 미팅 시각 HH:mm */
  reportMeetingTime?: string;
  /** face=대면(캘린더 등록) | call=통화 */
  reportMeetingMode?: 'face' | 'call' | '';
  /** 대면 미팅 연동 개인 체크리스트 ID */
  reportMeetingEventId?: string;
  /** 보고서 완료예정일 경과 상기 할일 ID */
  reportDueEventId?: string;
  /** 원천 항목별 분개 (employed, daily, insurance4 …) */
  laborJournal?: Partial<Record<string, boolean>>;
  /** @deprecated → laborJournal */
  journalDone?: Partial<Record<string, boolean>>;
  /** 통장 자료 수취 — 분기 4칸 [1-3,4-6,7-9,10-12] */
  bankReceiveQuarters?: boolean[];
  /** 통장 입력 — 분기 4칸 */
  bankEntryQuarters?: boolean[];
  /** @deprecated → bankReceiveQuarters */
  bankReceiveMonth?: number;
  /** @deprecated → bankEntryQuarters */
  bankEntryMonth?: number;
  /** @deprecated */
  bankReceive?: boolean;
  /** @deprecated */
  bankEntry?: boolean;
};

export type VatAnnualProgressMap = Record<string, VatAnnualYearState>;

export type VatAnnualTrackKind = 'labor' | 'vatLines' | 'bank' | 'other' | 'dual';

export type VatAnnualTrackDef = {
  key: string;
  label: string;
  kind: VatAnnualTrackKind;
  /** vatLines — 부가세 OX 연동 하위 줄 */
  lines?: ReadonlyArray<{ key: string; label: string }>;
  /** dual — vatEntryProgress 키 (△=수취 O=입력) */
  progressKey?: string;
  /** dual/bank — 법인만 */
  corporateOnly?: boolean;
};

export const VAT_PHASE_MONTH_SPAN: Record<
  VatPhase,
  { label: string; startMonth: number; endMonth: number }
> = {
  '1기 예정': { label: '1-3월', startMonth: 1, endMonth: 3 },
  '1기 확정': { label: '4-6월', startMonth: 4, endMonth: 6 },
  '2기 예정': { label: '7-9월', startMonth: 7, endMonth: 9 },
  '2기 확정': { label: '10-12월', startMonth: 10, endMonth: 12 },
};

export const VAT_ANNUAL_QUARTERS = VAT_PHASES.map(phase => ({
  phase,
  ...VAT_PHASE_MONTH_SPAN[phase],
}));

export const VAT_ANNUAL_TRACKS: readonly VatAnnualTrackDef[] = [
  {
    key: 'invoices',
    label: '세금계산서/계산서',
    kind: 'vatLines',
    lines: [
      { key: 'taxInvoice', label: '세금계산서' },
      { key: 'invoice', label: '계산서' },
    ],
  },
  {
    key: 'hometax',
    label: '홈택스(카드/현금)',
    kind: 'vatLines',
    lines: [
      { key: 'card', label: '카드' },
      { key: 'cashReceipt', label: '현금' },
    ],
  },
  {
    key: 'bank',
    label: '통장거래내역',
    kind: 'dual',
    progressKey: 'bankStatement',
    corporateOnly: true,
  },
  {
    key: 'other',
    label: '기타증빙',
    kind: 'dual',
    progressKey: 'otherEvidence',
  },
  /** 기타증빙 뒤에 원천 */
  { key: 'withholding', label: '원천', kind: 'labor' },
] as const;

export const VAT_PROGRESS_KEY_LABELS: Record<string, string> = {
  card: '카드',
  cashReceipt: '현금영수증',
  taxInvoice: '세금계산서',
  invoice: '계산서',
  otherEvidence: '기타증빙',
  bankStatement: '통장내역',
};

export type LaborSlotLike = { target: boolean; filed: boolean };

export type VatAnnualMarkStatus = 'O' | 'X' | '△' | '';

export const VAT_LABOR_ITEM_LABELS: Record<string, string> = {
  employed: '근로',
  daily: '일용',
  retirement: '퇴직',
  bizIncome: '사업',
  otherTax: '기타',
  interestDividend: '이자배당',
};

export const INSURANCE4_KEY = 'insurance4';
export const INSURANCE4_LABEL = '4대보험';

export type VatAnnualLaborItem = {
  key: string;
  label: string;
  target: boolean;
  filed: boolean;
  /** 클릭 = 분개 완료 */
  journaled: boolean;
};

/** O·X = 확인 완료(진행), △ = 수취만(0%), 빈칸 = 미확인 */
export type VatAnnualLineStatus = {
  key: string;
  label: string;
  mark: VatAnnualMarkStatus;
  throughMonth: number;
  pct: number;
  /** O 또는 X 로 한 기수라도 확인됨 */
  confirmed: boolean;
  /** VAT_PHASES 순서 — 기수별 OX (통장 분기 칸과 동일 UI) */
  phaseMarks?: VatAnnualMarkStatus[];
};

export type VatAnnualTrackStatus = {
  key: string;
  label: string;
  kind: VatAnnualTrackKind;
  applicable: boolean;
  exists: boolean;
  throughMonth: number;
  pct: number;
  lines?: VatAnnualLineStatus[];
  laborItems?: VatAnnualLaborItem[];
  /** 자료수취·입력 분기 4칸 (통장·기타증빙) */
  bankReceiveQuarters?: boolean[];
  bankEntryQuarters?: boolean[];
  /** 기타증빙 등 — 기수별 마크 (X=수취없음) */
  phaseMarks?: VatAnnualMarkStatus[];
  bankNa?: boolean;
  /** vatEntryProgress 키 */
  progressKey?: string;
};

export type VatAnnualProgressSummary = {
  done: number;
  total: number;
  pct: number;
  tracks: VatAnnualTrackStatus[];
  preliminaryReport: boolean;
  preliminaryReportDate: string;
  preliminaryReportDueDate: string;
  preliminaryMeetingDate: string;
  preliminaryMeetingTime: string;
  preliminaryMeetingMode: 'face' | 'call' | '';
  report: boolean;
  reportDate: string;
  reportDueDate: string;
  reportMeetingDate: string;
  reportMeetingTime: string;
  reportMeetingMode: 'face' | 'call' | '';
};

function todayYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function vatAnnualYearKey(year: number): string {
  return String(year);
}

function readLaborJournal(entry: VatAnnualYearState): Partial<Record<string, boolean>> {
  const fromNew =
    entry.laborJournal && typeof entry.laborJournal === 'object' ? { ...entry.laborJournal } : {};
  const fromOld =
    entry.journalDone && typeof entry.journalDone === 'object' ? { ...entry.journalDone } : {};
  // 예전 track-level withholding 키는 무시
  delete fromOld.withholding;
  return { ...fromOld, ...fromNew };
}

/** 연간 분기 칸 짧은 표기 (한 줄 유지) — title에 월 범위 */
export const BANK_QUARTER_LABELS = ['1/4', '2/4', '3/4', '4/4'] as const;
export const BANK_QUARTER_HINTS = ['1-3월', '4-6월', '7-9월', '10-12월'] as const;
export const BANK_QUARTER_END_MONTHS = [3, 6, 9, 12] as const;

export function emptyBankQuarters(): boolean[] {
  return [false, false, false, false];
}

export function normalizeBankQuarters(
  raw: unknown,
  legacyMonth?: unknown,
  legacyBool?: boolean,
): boolean[] {
  if (Array.isArray(raw) && raw.length >= 4) {
    return [0, 1, 2, 3].map(i => raw[i] === true);
  }
  const month = Number(legacyMonth);
  if (Number.isFinite(month) && month > 0) {
    return BANK_QUARTER_END_MONTHS.map(end => month >= end);
  }
  if (legacyBool === true) return [true, true, true, true];
  return emptyBankQuarters();
}

export function toggleBankQuarter(quarters: boolean[] | undefined, index: number): boolean[] {
  const next = normalizeBankQuarters(quarters);
  if (index < 0 || index > 3) return next;
  next[index] = !next[index];
  return next;
}

export function bankQuartersThroughMonth(quarters: boolean[] | undefined): number {
  const q = normalizeBankQuarters(quarters);
  let through = 0;
  for (let i = 0; i < 4; i += 1) {
    if (q[i]) through = BANK_QUARTER_END_MONTHS[i]!;
  }
  return through;
}

export function bankQuartersPct(quarters: boolean[] | undefined): number {
  const q = normalizeBankQuarters(quarters);
  const done = q.filter(Boolean).length;
  return Math.round((done / 4) * 100);
}

export function readVatAnnualYearState(
  intakeData: Record<string, unknown> | null | undefined,
  year: number,
): VatAnnualYearState {
  const raw = intakeData?.vatAnnualProgress;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entry = (raw as VatAnnualProgressMap)[vatAnnualYearKey(year)];
  if (!entry || typeof entry !== 'object') return {};
  return {
    laborJournal: readLaborJournal(entry),
    bankReceiveQuarters: normalizeBankQuarters(
      entry.bankReceiveQuarters,
      entry.bankReceiveMonth,
      entry.bankReceive === true,
    ),
    bankEntryQuarters: normalizeBankQuarters(
      entry.bankEntryQuarters,
      entry.bankEntryMonth,
      entry.bankEntry === true,
    ),
    preliminaryReport: entry.preliminaryReport === true,
    preliminaryReportDate: String(entry.preliminaryReportDate ?? '').trim(),
    preliminaryReportDueDate: String(entry.preliminaryReportDueDate ?? '').trim(),
    preliminaryMeetingDate: String(entry.preliminaryMeetingDate ?? '').trim(),
    preliminaryMeetingTime: String(entry.preliminaryMeetingTime ?? '').trim(),
    preliminaryMeetingMode:
      entry.preliminaryMeetingMode === 'face' || entry.preliminaryMeetingMode === 'call'
        ? entry.preliminaryMeetingMode
        : '',
    preliminaryMeetingEventId: String(entry.preliminaryMeetingEventId ?? '').trim(),
    preliminaryReportDueEventId: String(entry.preliminaryReportDueEventId ?? '').trim(),
    report: entry.report === true,
    reportDate: String(entry.reportDate ?? '').trim(),
    reportDueDate: String(entry.reportDueDate ?? '').trim(),
    reportMeetingDate: String(entry.reportMeetingDate ?? '').trim(),
    reportMeetingTime: String(entry.reportMeetingTime ?? '').trim(),
    reportMeetingMode:
      entry.reportMeetingMode === 'face' || entry.reportMeetingMode === 'call'
        ? entry.reportMeetingMode
        : '',
    reportMeetingEventId: String(entry.reportMeetingEventId ?? '').trim(),
    reportDueEventId: String(entry.reportDueEventId ?? '').trim(),
  };
}

export function mergeVatAnnualYearStatePatch(
  intakeData: Record<string, unknown>,
  year: number,
  patch: Partial<VatAnnualYearState>,
): Record<string, unknown> {
  const yk = vatAnnualYearKey(year);
  const prevMap =
    intakeData.vatAnnualProgress && typeof intakeData.vatAnnualProgress === 'object'
      ? ({ ...(intakeData.vatAnnualProgress as VatAnnualProgressMap) } as VatAnnualProgressMap)
      : ({} as VatAnnualProgressMap);
  const prev = readVatAnnualYearState(intakeData, year);

  let preliminaryReport =
    patch.preliminaryReport !== undefined ? patch.preliminaryReport : !!prev.preliminaryReport;
  let preliminaryReportDate =
    patch.preliminaryReportDate !== undefined
      ? String(patch.preliminaryReportDate ?? '').trim()
      : prev.preliminaryReportDate || '';

  if (patch.preliminaryReport === true && !preliminaryReportDate) {
    preliminaryReportDate = todayYmd();
  }
  if (patch.preliminaryReport === false) {
    preliminaryReport = false;
    preliminaryReportDate = '';
  }

  let report = patch.report !== undefined ? patch.report : !!prev.report;
  let reportDate =
    patch.reportDate !== undefined
      ? String(patch.reportDate ?? '').trim()
      : prev.reportDate || '';

  if (patch.report === true && !reportDate) {
    reportDate = todayYmd();
  }
  if (patch.report === false) {
    report = false;
    reportDate = '';
  }

  const preliminaryReportDueDate =
    patch.preliminaryReportDueDate !== undefined
      ? String(patch.preliminaryReportDueDate ?? '').trim()
      : prev.preliminaryReportDueDate || '';
  const preliminaryMeetingDate =
    patch.preliminaryMeetingDate !== undefined
      ? String(patch.preliminaryMeetingDate ?? '').trim()
      : prev.preliminaryMeetingDate || '';
  const preliminaryMeetingTime =
    patch.preliminaryMeetingTime !== undefined
      ? String(patch.preliminaryMeetingTime ?? '').trim()
      : prev.preliminaryMeetingTime || '';
  const preliminaryMeetingMode =
    patch.preliminaryMeetingMode !== undefined
      ? patch.preliminaryMeetingMode === 'face' || patch.preliminaryMeetingMode === 'call'
        ? patch.preliminaryMeetingMode
        : ''
      : prev.preliminaryMeetingMode || '';
  const preliminaryMeetingEventId =
    patch.preliminaryMeetingEventId !== undefined
      ? String(patch.preliminaryMeetingEventId ?? '').trim()
      : prev.preliminaryMeetingEventId || '';
  const preliminaryReportDueEventId =
    patch.preliminaryReportDueEventId !== undefined
      ? String(patch.preliminaryReportDueEventId ?? '').trim()
      : prev.preliminaryReportDueEventId || '';
  const reportDueDate =
    patch.reportDueDate !== undefined
      ? String(patch.reportDueDate ?? '').trim()
      : prev.reportDueDate || '';
  const reportMeetingDate =
    patch.reportMeetingDate !== undefined
      ? String(patch.reportMeetingDate ?? '').trim()
      : prev.reportMeetingDate || '';
  const reportMeetingTime =
    patch.reportMeetingTime !== undefined
      ? String(patch.reportMeetingTime ?? '').trim()
      : prev.reportMeetingTime || '';
  const reportMeetingMode =
    patch.reportMeetingMode !== undefined
      ? patch.reportMeetingMode === 'face' || patch.reportMeetingMode === 'call'
        ? patch.reportMeetingMode
        : ''
      : prev.reportMeetingMode || '';
  const reportMeetingEventId =
    patch.reportMeetingEventId !== undefined
      ? String(patch.reportMeetingEventId ?? '').trim()
      : prev.reportMeetingEventId || '';
  const reportDueEventId =
    patch.reportDueEventId !== undefined
      ? String(patch.reportDueEventId ?? '').trim()
      : prev.reportDueEventId || '';

  const laborJournal = { ...(prev.laborJournal || {}) };
  const laborPatch = patch.laborJournal || patch.journalDone;
  if (laborPatch && typeof laborPatch === 'object') {
    for (const [k, v] of Object.entries(laborPatch)) {
      if (k === 'withholding') continue;
      if (v) laborJournal[k] = true;
      else delete laborJournal[k];
    }
  }

  let bankReceiveQuarters = normalizeBankQuarters(prev.bankReceiveQuarters);
  let bankEntryQuarters = normalizeBankQuarters(prev.bankEntryQuarters);
  if (patch.bankReceiveQuarters !== undefined) {
    bankReceiveQuarters = normalizeBankQuarters(patch.bankReceiveQuarters);
  } else if (patch.bankReceiveMonth !== undefined) {
    bankReceiveQuarters = normalizeBankQuarters(undefined, patch.bankReceiveMonth);
  } else if (patch.bankReceive !== undefined) {
    bankReceiveQuarters = normalizeBankQuarters(undefined, undefined, patch.bankReceive);
  }
  if (patch.bankEntryQuarters !== undefined) {
    bankEntryQuarters = normalizeBankQuarters(patch.bankEntryQuarters);
  } else if (patch.bankEntryMonth !== undefined) {
    bankEntryQuarters = normalizeBankQuarters(undefined, patch.bankEntryMonth);
  } else if (patch.bankEntry !== undefined) {
    bankEntryQuarters = normalizeBankQuarters(undefined, undefined, patch.bankEntry);
  }

  prevMap[yk] = {
    laborJournal,
    bankReceiveQuarters,
    bankEntryQuarters,
    preliminaryReport,
    preliminaryReportDate: preliminaryReport ? preliminaryReportDate : '',
    preliminaryReportDueDate,
    preliminaryMeetingDate,
    preliminaryMeetingTime,
    preliminaryMeetingMode,
    preliminaryMeetingEventId,
    preliminaryReportDueEventId,
    report,
    reportDate: report ? reportDate : '',
    reportDueDate,
    reportMeetingDate,
    reportMeetingTime,
    reportMeetingMode,
    reportMeetingEventId,
    reportDueEventId,
  };
  return { ...intakeData, vatAnnualProgress: prevMap };
}

function normalizeMark(raw: string): VatAnnualMarkStatus {
  const m = raw.trim().toUpperCase();
  if (m === 'O' || m === '○') return 'O';
  if (m === 'X' || m === '×') return 'X';
  if (m === '△' || m === 'Δ') return '△';
  return raw.trim() ? '△' : '';
}

/** 셀에서 OX 마크만 추출 — 자유서식 text는 마크로 취급하지 않음 */
function cellOxMark(cell: VatProgressCell | undefined): VatAnnualMarkStatus {
  if (!cell) return '';
  const mark = String(cell.mark ?? '').trim();
  if (mark) return normalizeMark(mark);
  // 레거시: text에 O/X/△만 들어 있던 경우
  const text = String(cell.text ?? '').trim();
  if (
    text === 'O' || text === '○' || text === 'o' ||
    text === 'X' || text === '×' || text === 'x' ||
    text === '△' || text === 'Δ'
  ) {
    return normalizeMark(text);
  }
  return '';
}

/** 확인 완료(진행 반영): O 또는 X */
export function isConfirmedMark(m: VatAnnualMarkStatus): boolean {
  return m === 'O' || m === 'X';
}

function markRank(m: VatAnnualMarkStatus): number {
  // 표시용 우선순위 — O > X > △ (둘 다 확인이지만 O를 선호 표시)
  if (m === 'O') return 3;
  if (m === 'X') return 2;
  if (m === '△') return 1;
  return 0;
}

export function aggregateMarks(cells: Array<VatProgressCell | undefined>): VatAnnualMarkStatus {
  let best: VatAnnualMarkStatus = '';
  for (const cell of cells) {
    const m = cellOxMark(cell);
    if (markRank(m) > markRank(best)) best = m;
  }
  return best;
}

export function collectYearProgressByPhase(
  intakeData: Record<string, unknown> | null | undefined,
  year: number,
  phases: readonly VatPhase[] = VAT_PHASES,
): Record<string, VatPeriodProgress> {
  const out: Record<string, VatPeriodProgress> = {};
  for (const p of phases) {
    out[p] = readVatPeriodProgress(intakeData, vatProgressPeriodKey(year, p));
  }
  return out;
}

/** 확정 기수 → 대응 예정 기수 (1기 확정→1기 예정 …) */
export function pairedProvisionalPhase(phase: VatPhase): VatPhase | null {
  if (phase === '1기 확정') return '1기 예정';
  if (phase === '2기 확정') return '2기 예정';
  return null;
}

/** 확정에만 있고 예정이 비면 예정에 동일 값 복사 (표시·저장용) */
export function healPhaseMarksProvisional(
  phaseMarks: VatAnnualMarkStatus[],
): VatAnnualMarkStatus[] {
  const marks = [...phaseMarks];
  while (marks.length < VAT_PHASES.length) marks.push('');
  for (const confPhase of ['1기 확정', '2기 확정'] as const) {
    const prov = pairedProvisionalPhase(confPhase);
    if (!prov) continue;
    const ci = VAT_PHASES.indexOf(confPhase);
    const pi = VAT_PHASES.indexOf(prov);
    if (ci < 0 || pi < 0) continue;
    if (marks[ci] && !marks[pi]) marks[pi] = marks[ci]!;
  }
  return marks;
}

/** 기수별 마크 배열로 줄 상태 재구성 (저장값 그대로 — 예정 칸 개별 수정 유지) */
export function buildVatLineStatusFromPhaseMarks(
  key: string,
  label: string,
  phaseMarks: readonly VatAnnualMarkStatus[],
): VatAnnualLineStatus {
  let throughMonth = 0;
  let displayMark: VatAnnualMarkStatus = '';
  let confirmedCount = 0;
  const marks = phaseMarks.map(m => normalizeMark(m ?? ''));
  while (marks.length < VAT_PHASES.length) marks.push('');
  for (let i = 0; i < VAT_PHASES.length; i += 1) {
    const phase = VAT_PHASES[i]!;
    const span = VAT_PHASE_MONTH_SPAN[phase];
    const mark = marks[i] ?? '';
    if (markRank(mark) > markRank(displayMark)) displayMark = mark;
    if (isConfirmedMark(mark)) {
      throughMonth = Math.max(throughMonth, span.endMonth);
      confirmedCount += 1;
    }
  }
  return {
    key,
    label,
    mark: displayMark,
    throughMonth,
    pct: Math.round((confirmedCount / VAT_PHASES.length) * 100),
    confirmed: confirmedCount > 0,
    phaseMarks: marks,
  };
}

/** 단일 부가세 열 — 기수별 OX (O·X만 진행 %, 통장처럼 4칸) */
export function buildVatLineStatus(
  key: string,
  label: string,
  byPhase: Record<string, VatPeriodProgress>,
): VatAnnualLineStatus {
  const phaseMarks = VAT_PHASES.map(phase =>
    cellOxMark(byPhase[phase]?.[key]),
  );
  return buildVatLineStatusFromPhaseMarks(key, label, phaseMarks);
}

/**
 * 확정에 마크를 넣을 때 — 예정이 비어 있을 때만 예정에도 같은 마크.
 * 예정이 이미 있으면 절대 덮어쓰지 않음.
 */
export function planVatMarkWrites(
  byPhase: Record<string, VatPeriodProgress>,
  phase: VatPhase,
  key: string,
  nextMark: string,
): Array<{ phase: VatPhase; cell: VatProgressCell }> {
  const mark = normalizeMark(nextMark);
  const cell: VatProgressCell = mark ? { mark, text: '' } : { mark: '', text: '' };
  const writes: Array<{ phase: VatPhase; cell: VatProgressCell }> = [{ phase, cell }];
  const provisional = pairedProvisionalPhase(phase);
  if (provisional && mark) {
    const existingMark = cellOxMark(byPhase[provisional]?.[key]);
    if (!existingMark) {
      writes.push({ phase: provisional, cell: { mark, text: '' } });
    }
  }
  return writes;
}

/**
 * 확정 칸에 새 값을 쓴 뒤 — 예정이 비어 있을 때만 예정 동기화.
 * 예정에 이미 값이 있으면 유지.
 */
export function syncPairedProvisionalAfterWrite(
  phaseMarks: VatAnnualMarkStatus[],
  confirmedIndex: number,
  previousConfirmed: VatAnnualMarkStatus,
): VatAnnualMarkStatus[] {
  void previousConfirmed;
  const phase = VAT_PHASES[confirmedIndex];
  if (!phase) return phaseMarks;
  const provisional = pairedProvisionalPhase(phase);
  if (!provisional) return phaseMarks;
  const pi = VAT_PHASES.indexOf(provisional);
  if (pi < 0) return phaseMarks;
  const next = [...phaseMarks];
  while (next.length < VAT_PHASES.length) next.push('');
  const newMark = normalizeMark(next[confirmedIndex] ?? '');
  if (!newMark) return next;
  const provMark = normalizeMark(next[pi] ?? '');
  if (!provMark) next[pi] = newMark;
  return next;
}

/** 기수 OX 패치 + 확정→예정 자동 채우기 (자유서식 text·색칠은 마크 정규화 제외) */
export function mergeVatProgressMarkWrites(
  intakeData: Record<string, unknown>,
  year: number,
  phase: VatPhase,
  patch: VatPeriodProgress,
): Record<string, unknown> {
  const byPhase = collectYearProgressByPhase(intakeData, year, VAT_PHASES);
  let next = intakeData;
  for (const [key, cell] of Object.entries(patch)) {
    const periodKey = vatProgressPeriodKey(year, phase);

    if (!cell) {
      next = mergeVatPeriodProgressPatch(next, periodKey, { [key]: { text: '', mark: '', bg: '' } });
      const cleared = { ...(byPhase[phase] || {}) };
      delete cleared[key];
      byPhase[phase] = cleared;
      continue;
    }

    const text = String(cell.text ?? '').trim();
    const markRaw = String(cell.mark ?? '').trim();
    const bg = String(cell.bg ?? '').trim();

    // 자유서식: text가 있으면 OX 정규화하지 않고 그대로 저장
    if (text) {
      const preserved: VatProgressCell = { text, mark: '', bg };
      next = mergeVatPeriodProgressPatch(next, periodKey, { [key]: preserved });
      byPhase[phase] = { ...(byPhase[phase] || {}), [key]: preserved };
      continue;
    }

    // 색칠만 (값 없음)
    if (!markRaw && bg) {
      const preserved: VatProgressCell = { text: '', mark: '', bg };
      next = mergeVatPeriodProgressPatch(next, periodKey, { [key]: preserved });
      byPhase[phase] = { ...(byPhase[phase] || {}), [key]: preserved };
      continue;
    }

    // 값·마크·색 모두 비움 → 삭제
    if (!markRaw && !bg) {
      next = mergeVatPeriodProgressPatch(next, periodKey, { [key]: { text: '', mark: '', bg: '' } });
      const cleared = { ...(byPhase[phase] || {}) };
      delete cleared[key];
      byPhase[phase] = cleared;
      continue;
    }

    // OX 마크 입력 (+ 확정→예정 미러)
    const writes = planVatMarkWrites(byPhase, phase, key, markRaw);
    for (const w of writes) {
      const withBg: VatProgressCell = { ...w.cell, bg };
      next = mergeVatPeriodProgressPatch(next, vatProgressPeriodKey(year, w.phase), {
        [key]: withBg,
      });
      const pk = w.phase;
      byPhase[pk] = { ...(byPhase[pk] || {}), [key]: withBg };
    }
  }
  // 통장·기타증빙 마크 → 연간 분기/표시용 동기
  if (Object.prototype.hasOwnProperty.call(patch, 'bankStatement')) {
    next = syncAnnualBankQuartersFromMarks(next, year);
  }
  // 확정 기수 저장 시에만 빈 예정 보강 (예정 칸 개별 수정 유지)
  if (pairedProvisionalPhase(phase)) {
    next = backfillEmptyProvisionalMarks(next, year);
  }
  return next;
}

/** 저장된 확정 마크만 있고 예정이 비어 있으면 예정에 동일 마크 보강 */
export function backfillEmptyProvisionalMarks(
  intakeData: Record<string, unknown>,
  year: number,
): Record<string, unknown> {
  const byPhase = collectYearProgressByPhase(intakeData, year, VAT_PHASES);
  const keys = new Set<string>();
  for (const phase of VAT_PHASES) {
    for (const k of Object.keys(byPhase[phase] || {})) keys.add(k);
  }
  let next = intakeData;
  for (const key of keys) {
    for (const conf of ['1기 확정', '2기 확정'] as const) {
      const mark = cellOxMark(byPhase[conf]?.[key]);
      if (!mark) continue;
      const prov = pairedProvisionalPhase(conf);
      if (!prov) continue;
      const existing = cellOxMark(byPhase[prov]?.[key]);
      if (existing) continue;
      next = mergeVatPeriodProgressPatch(next, vatProgressPeriodKey(year, prov), {
        [key]: { mark, text: '' },
      });
      byPhase[prov] = { ...(byPhase[prov] || {}), [key]: { mark, text: '' } };
    }
  }
  return next;
}

/** △=자료수취 / O=입력(수취포함) / X=자료수취 없음 */
export function markToReceiveEntry(mark: VatAnnualMarkStatus): {
  receive: boolean;
  entry: boolean;
  none: boolean;
} {
  if (mark === 'X') return { receive: false, entry: false, none: true };
  if (mark === 'O') return { receive: true, entry: true, none: false };
  if (mark === '△') return { receive: true, entry: false, none: false };
  return { receive: false, entry: false, none: false };
}

export function receiveEntryToMark(
  receive: boolean,
  entry: boolean,
  none = false,
): VatAnnualMarkStatus {
  if (none) return 'X';
  if (entry) return 'O';
  if (receive) return '△';
  return '';
}

export function phaseMarksFromProgressKey(
  byPhase: Record<string, VatPeriodProgress>,
  progressKey: string,
): VatAnnualMarkStatus[] {
  return VAT_PHASES.map(phase =>
    cellOxMark(byPhase[phase]?.[progressKey]),
  );
}

export function quartersFromProgressKey(
  byPhase: Record<string, VatPeriodProgress>,
  progressKey: string,
): { receive: boolean[]; entry: boolean[]; none: boolean[]; phaseMarks: VatAnnualMarkStatus[] } {
  const receive = emptyBankQuarters();
  const entry = emptyBankQuarters();
  const none = emptyBankQuarters();
  const phaseMarks = phaseMarksFromProgressKey(byPhase, progressKey);
  for (let i = 0; i < VAT_PHASES.length; i += 1) {
    const re = markToReceiveEntry(phaseMarks[i] ?? '');
    receive[i] = re.receive;
    entry[i] = re.entry;
    none[i] = re.none;
  }
  return {
    receive,
    entry,
    none,
    phaseMarks,
  };
}

/** 기타증빙 수취: 빈칸 → △ → X(없음) → 빈칸 (O면 먼저 △로). X면 입력도 X */
export function toggleOtherReceiveMark(
  marks: VatAnnualMarkStatus[] | undefined,
  index: number,
): VatAnnualMarkStatus[] {
  const next = (marks ?? ['', '', '', '']).map(m => normalizeMark(m));
  while (next.length < 4) next.push('');
  if (index < 0 || index > 3) return next;
  const prev = next[index] ?? '';
  const cur = prev;
  if (cur === 'O') next[index] = '△';
  else if (cur === '△') next[index] = 'X';
  else if (cur === 'X') next[index] = '';
  else next[index] = '△';
  // 확정 칸만 예정 자동 동기 — 예정 칸 클릭은 그대로 반영
  const phase = VAT_PHASES[index];
  if (phase && pairedProvisionalPhase(phase)) {
    return syncPairedProvisionalAfterWrite(next, index, prev);
  }
  return next;
}

/** 기타증빙 입력: O 토글. 수취가 X면 항상 X 유지 */
export function toggleOtherEntryMark(
  marks: VatAnnualMarkStatus[] | undefined,
  index: number,
): VatAnnualMarkStatus[] {
  const next = (marks ?? ['', '', '', '']).map(m => normalizeMark(m));
  while (next.length < 4) next.push('');
  if (index < 0 || index > 3) return next;
  const prev = next[index] ?? '';
  const cur = prev;
  if (cur === 'X') return next;
  if (cur === 'O') next[index] = '△';
  else next[index] = 'O';
  const phase = VAT_PHASES[index];
  if (phase && pairedProvisionalPhase(phase)) {
    return syncPairedProvisionalAfterWrite(next, index, prev);
  }
  return next;
}

/** 확정에 마크 있고 예정이 비면 예정 복사 */
export function applyProvisionalMarkFill(
  marks: VatAnnualMarkStatus[],
): VatAnnualMarkStatus[] {
  return healPhaseMarksProvisional(marks);
}

/** 확정 분기에 값이 있고 예정이 비면 예정에 동일 수취·입력 복사 */
export function applyProvisionalQuarterFill(
  receive: boolean[],
  entry: boolean[],
): { receive: boolean[]; entry: boolean[] } {
  const r = normalizeBankQuarters(receive);
  const e = normalizeBankQuarters(entry);
  for (let i = 0; i < 4; i += 1) {
    if (e[i]) r[i] = true;
  }
  for (const confIdx of [1, 3] as const) {
    const provIdx = confIdx - 1;
    const confHas = !!(r[confIdx] || e[confIdx]);
    const provHas = !!(r[provIdx] || e[provIdx]);
    if (confHas && !provHas) {
      r[provIdx] = r[confIdx]!;
      e[provIdx] = e[confIdx]!;
    }
  }
  return { receive: r, entry: e };
}

export function toggleReceiveEntryQuarter(
  receive: boolean[] | undefined,
  entry: boolean[] | undefined,
  which: 'receive' | 'entry',
  index: number,
): { receive: boolean[]; entry: boolean[] } {
  const r = normalizeBankQuarters(receive);
  const e = normalizeBankQuarters(entry);
  if (index < 0 || index > 3) return { receive: r, entry: e };
  if (which === 'receive') {
    r[index] = !r[index];
    if (!r[index]) e[index] = false;
  } else {
    e[index] = !e[index];
    if (e[index]) r[index] = true;
  }
  // 확정 분기(2·4칸)만 빈 예정에 복사 — 예정 칸은 개별 수정 유지
  const phase = VAT_PHASES[index];
  if (phase && pairedProvisionalPhase(phase)) {
    return applyProvisionalQuarterFill(r, e);
  }
  return { receive: r, entry: e };
}

/** 수취·입력 분기 → 기수별 vatEntryProgress 마크 기록 (+확정→예정 채움) */
export function mergeReceiveEntryQuartersPatch(
  intakeData: Record<string, unknown>,
  year: number,
  progressKey: string,
  receiveQuarters: boolean[],
  entryQuarters: boolean[],
): Record<string, unknown> {
  // 클라이언트가 토글 후 보낸 값 유지 (예정 개별 해제 가능)
  const receive = normalizeBankQuarters(receiveQuarters);
  const entry = normalizeBankQuarters(entryQuarters);
  let next = intakeData;
  for (let i = 0; i < VAT_PHASES.length; i += 1) {
    const phase = VAT_PHASES[i]!;
    const mark = receiveEntryToMark(!!receive[i], !!entry[i]);
    next = mergeVatPeriodProgressPatch(next, vatProgressPeriodKey(year, phase), {
      [progressKey]: mark ? { mark, text: '' } : { mark: '', text: '' },
    });
  }
  if (progressKey === 'bankStatement') {
    next = mergeVatAnnualYearStatePatch(next, year, {
      bankReceiveQuarters: receive,
      bankEntryQuarters: entry,
    });
  }
  return next;
}

/** 기수별 마크 배열 저장 (기타증빙 X 포함) — 클라이언트가 보낸 배열 그대로 (예정 개별값 유지) */
export function mergePhaseMarksPatch(
  intakeData: Record<string, unknown>,
  year: number,
  progressKey: string,
  phaseMarks: VatAnnualMarkStatus[],
): Record<string, unknown> {
  const marks = [0, 1, 2, 3].map(i => normalizeMark(phaseMarks[i] ?? ''));
  let next = intakeData;
  for (let i = 0; i < VAT_PHASES.length; i += 1) {
    const phase = VAT_PHASES[i]!;
    const mark = marks[i] ?? '';
    next = mergeVatPeriodProgressPatch(next, vatProgressPeriodKey(year, phase), {
      [progressKey]: mark ? { mark, text: '' } : { mark: '', text: '' },
    });
  }
  if (progressKey === 'bankStatement') {
    const receive = emptyBankQuarters();
    const entry = emptyBankQuarters();
    for (let i = 0; i < 4; i += 1) {
      const re = markToReceiveEntry(marks[i] ?? '');
      receive[i] = re.receive;
      entry[i] = re.entry;
    }
    next = mergeVatAnnualYearStatePatch(next, year, {
      bankReceiveQuarters: receive,
      bankEntryQuarters: entry,
    });
  }
  return next;
}

export function syncAnnualBankQuartersFromMarks(
  intakeData: Record<string, unknown>,
  year: number,
): Record<string, unknown> {
  const byPhase = collectYearProgressByPhase(intakeData, year, VAT_PHASES);
  const { receive, entry } = quartersFromProgressKey(byPhase, 'bankStatement');
  return mergeVatAnnualYearStatePatch(intakeData, year, {
    bankReceiveQuarters: receive,
    bankEntryQuarters: entry,
  });
}

export function rebuildVatLinesTrackFromLines(
  track: VatAnnualTrackStatus,
  lines: VatAnnualLineStatus[],
): VatAnnualTrackStatus {
  const throughMonth = lines.length
    ? Math.round(lines.reduce((s, l) => s + l.throughMonth, 0) / lines.length)
    : 0;
  const pct = lines.length ? Math.round(lines.reduce((s, l) => s + l.pct, 0) / lines.length) : 0;
  const allEmpty = lines.every(l => !l.mark && !(l.phaseMarks ?? []).some(Boolean));
  return {
    ...track,
    lines,
    throughMonth,
    pct,
    exists: !allEmpty,
  };
}

export function buildLaborTrackStatus(
  labor: Record<string, LaborSlotLike> | undefined,
  laborJournal: Partial<Record<string, boolean>> | undefined,
): VatAnnualTrackStatus {
  const journals = laborJournal || {};
  const items: VatAnnualLaborItem[] = [];

  for (const [key, label] of Object.entries(VAT_LABOR_ITEM_LABELS)) {
    const slot = labor?.[key];
    if (!slot?.target) continue;
    items.push({
      key,
      label,
      target: true,
      filed: !!slot.filed,
      journaled: journals[key] === true,
    });
    if (key === 'employed') {
      items.push({
        key: INSURANCE4_KEY,
        label: INSURANCE4_LABEL,
        target: true,
        filed: false,
        journaled: journals[INSURANCE4_KEY] === true,
      });
    }
  }

  const exists = items.length > 0;

  return {
    key: 'withholding',
    label: '원천',
    kind: 'labor',
    applicable: exists,
    exists,
    throughMonth: 0,
    pct: 0,
    laborItems: items,
  };
}

export function buildVatLinesTrackStatus(
  def: VatAnnualTrackDef,
  byPhase: Record<string, VatPeriodProgress>,
): VatAnnualTrackStatus {
  const lines = (def.lines ?? []).map(l => buildVatLineStatus(l.key, l.label, byPhase));
  const throughMonth = lines.length
    ? Math.round(lines.reduce((s, l) => s + l.throughMonth, 0) / lines.length)
    : 0;
  const pct = lines.length
    ? Math.round(lines.reduce((s, l) => s + l.pct, 0) / lines.length)
    : 0;
  const allEmpty = lines.every(l => !l.mark);
  return {
    key: def.key,
    label: def.label,
    kind: def.kind,
    applicable: true,
    exists: !allEmpty,
    throughMonth,
    pct,
    lines,
  };
}

export function buildDualReceiveEntryTrackStatus(
  def: VatAnnualTrackDef,
  byPhase: Record<string, VatPeriodProgress>,
  annual: VatAnnualYearState,
  isCorporate: boolean,
): VatAnnualTrackStatus {
  const progressKey = def.progressKey || def.key;
  const corporateOnly = !!def.corporateOnly;
  if (corporateOnly && !isCorporate) {
    return {
      key: def.key,
      label: def.label,
      kind: 'dual',
      applicable: false,
      exists: false,
      throughMonth: 0,
      pct: 0,
      bankNa: true,
      progressKey,
      bankReceiveQuarters: emptyBankQuarters(),
      bankEntryQuarters: emptyBankQuarters(),
    };
  }

  const fromVat = quartersFromProgressKey(byPhase, progressKey);
  const hasVatMark = VAT_PHASES.some(p =>
    Boolean(cellOxMark(byPhase[p]?.[progressKey])),
  );

  let receiveQ = fromVat.receive;
  let entryQ = fromVat.entry;
  let phaseMarks = fromVat.phaseMarks;
  // 통장: VAT 마크가 없으면 연간 전용 분기 값 승계
  if (!hasVatMark && progressKey === 'bankStatement') {
    receiveQ = normalizeBankQuarters(annual.bankReceiveQuarters);
    entryQ = normalizeBankQuarters(annual.bankEntryQuarters);
    phaseMarks = [0, 1, 2, 3].map(i =>
      receiveEntryToMark(!!receiveQ[i], !!entryQ[i]),
    );
  }

  const receiveMonth = bankQuartersThroughMonth(receiveQ);
  const entryMonth = bankQuartersThroughMonth(entryQ);
  const receivePct = bankQuartersPct(receiveQ);
  const entryPct = bankQuartersPct(entryQ);
  // X(수취없음) = 수취·입력 둘 다 처리 완료로 간주
  const noneCount = phaseMarks.filter(m => m === 'X').length;
  const pct = Math.round(
    ((receivePct / 100) * 4 + noneCount + (entryPct / 100) * 4 + noneCount) / 8 * 100,
  );
  const exists =
    receiveQ.some(Boolean) || entryQ.some(Boolean) || phaseMarks.some(Boolean);

  return {
    key: def.key,
    label: def.label,
    kind: 'dual',
    applicable: true,
    exists,
    throughMonth: Math.round((receiveMonth + entryMonth) / 2),
    pct,
    bankNa: false,
    progressKey,
    bankReceiveQuarters: receiveQ,
    bankEntryQuarters: entryQ,
    phaseMarks,
    lines: [
      {
        key: `${def.key}Receive`,
        label: '수취',
        mark: '',
        throughMonth: receiveMonth,
        pct: receivePct,
        confirmed: receiveMonth > 0 || noneCount > 0,
      },
      {
        key: `${def.key}Entry`,
        label: '입력',
        mark: '',
        throughMonth: entryMonth,
        pct: entryPct,
        confirmed: entryMonth > 0 || noneCount > 0,
      },
    ],
  };
}

/** @deprecated buildDualReceiveEntryTrackStatus 사용 */
export function buildBankTrackStatus(
  annual: VatAnnualYearState,
  isCorporate: boolean,
  byPhase: Record<string, VatPeriodProgress> = {},
): VatAnnualTrackStatus {
  return buildDualReceiveEntryTrackStatus(
    {
      key: 'bank',
      label: '통장거래내역',
      kind: 'dual',
      progressKey: 'bankStatement',
      corporateOnly: true,
    },
    byPhase,
    annual,
    isCorporate,
  );
}

export function buildVatAnnualTrackStatuses(
  labor: Record<string, LaborSlotLike> | undefined,
  byPhase: Record<string, VatPeriodProgress>,
  annual: VatAnnualYearState,
  isCorporate: boolean,
  tracks: readonly VatAnnualTrackDef[] = VAT_ANNUAL_TRACKS,
): VatAnnualTrackStatus[] {
  return tracks.map(track => {
    if (track.kind === 'labor') {
      return buildLaborTrackStatus(labor, annual.laborJournal);
    }
    if (track.kind === 'dual' || track.kind === 'bank' || track.kind === 'other') {
      return buildDualReceiveEntryTrackStatus(track, byPhase, annual, isCorporate);
    }
    return buildVatLinesTrackStatus(track, byPhase);
  });
}

export function summarizeVatAnnualProgress(
  tracks: VatAnnualTrackStatus[],
  annual: VatAnnualYearState,
): VatAnnualProgressSummary {
  let unitsDone = 0;
  let unitsTotal = 0;

  for (const t of tracks) {
    if (t.kind === 'labor') {
      for (const item of t.laborItems ?? []) {
        unitsTotal += 1;
        if (item.journaled) unitsDone += 1;
      }
      continue;
    }
    if (t.kind === 'dual' || t.kind === 'bank' || t.kind === 'other') {
      if (!t.applicable || t.bankNa) continue;
      unitsTotal += 2;
      unitsDone += bankQuartersPct(t.bankReceiveQuarters) / 100;
      unitsDone += bankQuartersPct(t.bankEntryQuarters) / 100;
      continue;
    }
    // vatLines — 줄별: O·X 로 채운 기수 비율
    for (const line of t.lines ?? []) {
      unitsTotal += 1;
      unitsDone += line.pct / 100;
    }
  }

  unitsTotal += 2;
  if (annual.preliminaryReport) unitsDone += 1;
  if (annual.report) unitsDone += 1;

  const pct = unitsTotal ? Math.round((unitsDone / unitsTotal) * 100) : 0;

  return {
    done: Math.round(unitsDone * 10) / 10,
    total: unitsTotal,
    pct,
    tracks,
    preliminaryReport: !!annual.preliminaryReport,
    preliminaryReportDate: annual.preliminaryReportDate || '',
    preliminaryReportDueDate: annual.preliminaryReportDueDate || '',
    preliminaryMeetingDate: annual.preliminaryMeetingDate || '',
    preliminaryMeetingTime: annual.preliminaryMeetingTime || '',
    preliminaryMeetingMode: annual.preliminaryMeetingMode || '',
    report: !!annual.report,
    reportDate: annual.reportDate || '',
    reportDueDate: annual.reportDueDate || '',
    reportMeetingDate: annual.reportMeetingDate || '',
    reportMeetingTime: annual.reportMeetingTime || '',
    reportMeetingMode: annual.reportMeetingMode || '',
  };
}

export function computeVatAnnualProgressForClient(
  _client: Pick<ClientRecord, 'intakeData'>,
  labor: Record<string, LaborSlotLike> | undefined,
  year: number,
  phases: readonly VatPhase[],
  intakeData?: Record<string, unknown> | null,
  _filedMonths?: readonly boolean[],
  isCorporate = true,
): VatAnnualProgressSummary {
  const data = intakeData ?? _client.intakeData ?? {};
  const annual = readVatAnnualYearState(data, year);
  const byPhase = collectYearProgressByPhase(data, year, phases.length ? phases : VAT_PHASES);
  const tracks = buildVatAnnualTrackStatuses(labor, byPhase, annual, isCorporate);
  return summarizeVatAnnualProgress(tracks, annual);
}
