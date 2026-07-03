import {
  portalAlertInfo,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalFieldLabel,
  portalInput,
  portalSectionDesc,
} from '@/app/components/portal/uiClasses';

export const noticeSection = `${portalCard} p-4`;
export const noticeSectionCompact = `${portalCard} p-3`;
export const noticeInput = portalInput;
export const noticeTextarea = `${portalInput} resize-y min-h-[4.5rem]`;
/** 기본 한 줄, 사용자가 세로 크기 조절 */
export const noticeTextareaCompact = `${portalInput} resize-y min-h-[2.75rem] max-h-[32rem] overflow-auto`;
export const noticeLabel = portalFieldLabel;
export const noticeMeta = portalSectionDesc;
export const noticeBtnPrimary = portalBtnPrimary;
export const noticeBtnSecondary = portalBtnSecondary;
export const noticeAlertInfo = portalAlertInfo;

export const noticeTwoCol = 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch';

export const noticePageSplit =
  'grid w-full grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 md:items-start';

export const noticeHalfRow = 'grid grid-cols-2 gap-3';

export const noticeSectionTitle = 'text-sm font-semibold text-slate-900';

export function noticeChip(active: boolean) {
  return [
    'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
    active
      ? 'border-blue-300 bg-blue-50 text-blue-900 shadow-sm'
      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
  ].join(' ');
}
