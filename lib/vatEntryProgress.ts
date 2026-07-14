import type { ClientRecord } from '@/app/types/client';

/** 부가세 자료입력 진행도 — 세목 기간별 */
export const VAT_PROGRESS_COLORS = ['', '#BFDBFE', '#FEF08A', '#BBF7D0', '#FBCFE8'] as const;

export type VatProgressCell = {
  /** 자유 텍스트 (엑셀처럼) */
  text?: string;
  /** @deprecated 이전 O/X/△ — 표시 시 text로 승계 */
  mark?: string;
  bg?: string;
};

export type VatProgressInputKind = 'mark' | 'text';

export type VatProgressColumnDef = {
  key: string;
  label: string;
  /** mark = O/X/△ 클릭 · text = 자유 입력 */
  input: VatProgressInputKind;
};

/** 표준 기본 틀 — 자료 열은 O/X/△ */
export const VAT_PROGRESS_DEFAULT_COLUMNS: VatProgressColumnDef[] = [
  { key: 'taxInvoice', label: '세금계산서', input: 'mark' },
  { key: 'invoice', label: '계산서', input: 'mark' },
  { key: 'manualEntry', label: '수기', input: 'mark' },
  { key: 'nonDeductible', label: '불공제', input: 'mark' },
  { key: 'card', label: '카드', input: 'mark' },
  { key: 'cashReceipt', label: '현금영수증', input: 'mark' },
  { key: 'otherEvidence', label: '기타증빙', input: 'mark' },
  { key: 'agencySales', label: '신용매출', input: 'mark' },
  { key: 'zeroRateSales', label: '영세율매출', input: 'mark' },
  { key: 'bankStatement', label: '통장내역', input: 'mark' },
];

/** @deprecated 호환 */
export const VAT_PROGRESS_DEFAULT_COLUMN_ORDER = VAT_PROGRESS_DEFAULT_COLUMNS.map(c => c.key);
export const VAT_PROGRESS_LABELS: Record<string, string> = Object.fromEntries(
  VAT_PROGRESS_DEFAULT_COLUMNS.map(c => [c.key, c.label]),
);

export type VatProgressItemKey = string;

export type VatMaterialFlags = {
  agencySales: boolean;
  zeroRateSales: boolean;
  nonDeductible: boolean;
  manualEntry: boolean;
};

export type VatPeriodProgress = Partial<Record<string, VatProgressCell>>;
export type VatEntryProgressMap = Record<string, VatPeriodProgress>;

export function vatProgressPeriodKey(year: number, vatPhase: string): string {
  return `${year}:${vatPhase}`;
}

export function cellDisplayValue(cell: VatProgressCell | undefined): string {
  if (!cell) return '';
  const text = String(cell.text ?? '').trim();
  if (text) return text;
  return String(cell.mark ?? '').trim();
}

export function readVatMaterialFlags(
  intakeData: Record<string, unknown> | null | undefined,
): VatMaterialFlags {
  const raw = intakeData?.vatMaterialFlags;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { agencySales: false, zeroRateSales: false, nonDeductible: false, manualEntry: false };
  }
  const o = raw as Record<string, unknown>;
  return {
    agencySales: o.agencySales === true,
    zeroRateSales: o.zeroRateSales === true,
    nonDeductible: o.nonDeductible === true,
    manualEntry: o.manualEntry === true,
  };
}

export function readVatPeriodProgress(
  intakeData: Record<string, unknown> | null | undefined,
  periodKey: string,
): VatPeriodProgress {
  const raw = intakeData?.vatEntryProgress;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entry = (raw as VatEntryProgressMap)[periodKey];
  if (!entry || typeof entry !== 'object') return {};
  return { ...entry };
}

export function cycleVatColor(current: string | undefined): string {
  const cur = current || '';
  const idx = (VAT_PROGRESS_COLORS as readonly string[]).indexOf(cur);
  return VAT_PROGRESS_COLORS[(idx + 1) % VAT_PROGRESS_COLORS.length];
}

export function normalizeVatProgressLayout(
  columns: readonly VatProgressColumnDef[] | null | undefined,
): VatProgressColumnDef[] {
  const defaultInput = new Map(VAT_PROGRESS_DEFAULT_COLUMNS.map(c => [c.key, c.input]));
  const out: VatProgressColumnDef[] = [];
  const seen = new Set<string>();
  for (const col of columns ?? []) {
    const key = String(col?.key ?? '').trim();
    const label = String(col?.label ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const rawInput = (col as { input?: string })?.input;
    const input: VatProgressInputKind =
      rawInput === 'text' || rawInput === 'mark'
        ? rawInput
        : (defaultInput.get(key) ?? 'text');
    out.push({ key, label: label || key, input });
  }
  if (out.length === 0) return VAT_PROGRESS_DEFAULT_COLUMNS.map(c => ({ ...c }));
  return out;
}

/** 예전 키 배열 저장 → 레이아웃 승계 */
export function layoutFromLegacyOrder(order: readonly string[] | null | undefined): VatProgressColumnDef[] {
  if (!order?.length) return VAT_PROGRESS_DEFAULT_COLUMNS.map(c => ({ ...c }));
  const byKey = new Map(VAT_PROGRESS_DEFAULT_COLUMNS.map(c => [c.key, c]));
  const out: VatProgressColumnDef[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const k = String(key).trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const def = byKey.get(k);
    out.push(def ? { ...def } : { key: k, label: VAT_PROGRESS_LABELS[k] || k, input: 'text' });
  }
  for (const c of VAT_PROGRESS_DEFAULT_COLUMNS) {
    if (!seen.has(c.key)) {
      out.push({ ...c });
      seen.add(c.key);
    }
  }
  return out.length ? out : VAT_PROGRESS_DEFAULT_COLUMNS.map(c => ({ ...c }));
}

export function createVatProgressColumnKey(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function visibleVatProgressKeys(
  _client: Pick<ClientRecord, 'businessEntityType' | 'intakeData'>,
  layout?: readonly VatProgressColumnDef[],
): string[] {
  return normalizeVatProgressLayout(layout).map(c => c.key);
}

export function mergeVatPeriodProgressPatch(
  intakeData: Record<string, unknown>,
  periodKey: string,
  patch: VatPeriodProgress,
): Record<string, unknown> {
  const prevMap =
    intakeData.vatEntryProgress && typeof intakeData.vatEntryProgress === 'object'
      ? ({ ...(intakeData.vatEntryProgress as VatEntryProgressMap) } as VatEntryProgressMap)
      : ({} as VatEntryProgressMap);
  const prev = { ...(prevMap[periodKey] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (!v) {
      delete prev[k];
      continue;
    }
    const text = String(v.text ?? '').trim();
    const mark = String(v.mark ?? '').trim();
    const bg = (v.bg || '').trim();
    if (!text && !mark && !bg) delete prev[k];
    else prev[k] = { text, mark, bg };
  }
  prevMap[periodKey] = prev;
  return { ...intakeData, vatEntryProgress: prevMap };
}

export function isVatProgressCellFilled(cell: VatProgressCell | undefined): boolean {
  if (!cell) return false;
  return Boolean(cellDisplayValue(cell) || (cell.bg && String(cell.bg).trim()));
}

export function summarizeVatPeriodProgress(
  progress: VatPeriodProgress,
  columns: readonly VatProgressColumnDef[],
): { done: number; total: number; filledLabels: string[] } {
  const cols = normalizeVatProgressLayout(columns);
  let done = 0;
  const filledLabels: string[] = [];
  for (const col of cols) {
    if (isVatProgressCellFilled(progress[col.key])) {
      done += 1;
      filledLabels.push(col.label);
    }
  }
  return { done, total: cols.length, filledLabels };
}

/** @deprecated */
export const VAT_PROGRESS_MARKS = ['', 'O', 'X', '△'] as const;
export function cycleVatMark(current: string | undefined): string {
  const marks = VAT_PROGRESS_MARKS;
  const cur = (current || '') as (typeof marks)[number];
  const idx = marks.indexOf(cur);
  return marks[(idx + 1) % marks.length];
}
