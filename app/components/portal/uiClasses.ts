/** 포털 페이지 공통 Tailwind 클래스 */

export const portalPage =
  'min-h-screen flex flex-col bg-[var(--background)] bg-gradient-to-b from-slate-50 via-[var(--background)] to-slate-100/70';

export const portalMain = 'flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8';

export const portalMainNarrow = 'flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8';

export const portalH1 = 'text-2xl sm:text-[1.625rem] font-bold tracking-tight text-slate-900 leading-tight';

export const portalSubtitle = 'portal-meta mt-1.5 max-w-2xl leading-relaxed';

export const portalCard =
  'rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50';

export const portalToolbar = `${portalCard} flex flex-wrap items-center gap-3 p-4 mb-5`;

export const portalInput =
  'text-sm leading-normal border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 transition-shadow';

export const portalSelect = portalInput;

export const portalBtnSecondary =
  'inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg px-3.5 py-2 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors';

export const portalBtnPrimary =
  'inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg px-3.5 py-2 text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-colors';

export const portalBtnDark =
  'inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg px-3.5 py-2 text-white bg-slate-800 hover:bg-slate-700 shadow-sm transition-colors disabled:opacity-50';

export const portalBtnDangerFill =
  'inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg px-3.5 py-2 text-white bg-red-600 hover:bg-red-700 shadow-sm shadow-red-600/20 transition-colors disabled:opacity-50';

export const portalBtnSuccessFill =
  'inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg px-3.5 py-2 text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition-colors disabled:opacity-50';

export const portalLabel =
  'inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none';

export const portalFieldLabel = 'portal-field-label';

export const portalSectionTitle = 'text-lg font-semibold text-slate-900 tracking-tight';

export const portalSectionDesc = 'portal-meta mt-1';

export const portalFooterMeta =
  'mt-8 pt-5 border-t border-slate-200 text-center text-sm text-slate-600 leading-relaxed';

export const portalContent = 'max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8';

export const portalToolTabGroup =
  'inline-flex p-1 gap-0.5 rounded-xl bg-slate-100 border border-slate-200 shadow-inner shadow-slate-200/40';

export const portalEmptyState =
  'rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600 leading-relaxed';

export const portalAccentSection =
  `${portalCard} p-5 sm:p-6 bg-gradient-to-br from-orange-50/90 to-amber-50/50 border-orange-200/80`;

export const portalData = 'portal-data';

export function portalToolTab(active: boolean, accent: 'orange' | 'indigo' | 'blue') {
  const base = 'px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-150';
  if (!active) {
    return `${base} text-slate-600 hover:text-slate-800 hover:bg-white/70`;
  }
  if (accent === 'orange') {
    return `${base} bg-white text-orange-800 shadow-sm ring-1 ring-orange-200/80`;
  }
  if (accent === 'indigo') {
    return `${base} bg-white text-indigo-800 shadow-sm ring-1 ring-indigo-200/80`;
  }
  return `${base} bg-white text-blue-800 shadow-sm ring-1 ring-blue-200/80`;
}

export function portalChip(active: boolean, opts?: { self?: boolean }) {
  const base =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border transition-colors';
  if (active) {
    if (opts?.self) return `${base} border-blue-300 bg-blue-50 text-blue-950`;
    return `${base} border-slate-300 bg-slate-100 text-slate-900`;
  }
  return `${base} border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800`;
}

export function portalChipCount(active: boolean) {
  return [
    'tabular-nums text-xs font-semibold rounded-md px-1.5 py-0.5 min-w-[1.25rem] text-center',
    active ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500',
  ].join(' ');
}

export const portalAlertError =
  'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-900';

export const portalAlertWarning =
  'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950';

export const portalAlertInfo =
  'rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-900';

export const portalBtnDanger =
  'text-sm font-medium rounded-lg px-3.5 py-2 text-red-800 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50';
