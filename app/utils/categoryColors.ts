/**
 * 수임처 구분(법인 / 개인 / 신고대리) 색상 — 모든 화면 공통.
 *   - 법인   : 하늘/파랑 (sky)
 *   - 개인   : 초록/연두 (emerald)
 *   - 신고대리: 보라 (violet)
 *
 * Tailwind는 정적 클래스 문자열만 인식하므로 조합하지 말고 완성형으로 둔다.
 */
export type CategoryColorKey = '법인' | '개인' | '신고대리' | '지주택';

export type CategoryColor = {
  /** 점(●) 배경 */
  dot: string;
  /** 카운트/강조 텍스트 */
  text: string;
  /** 좌측 강조 보더 */
  accent: string;
  /** 패널 헤더 배경 */
  headerBg: string;
  /** 패널 헤더 텍스트 */
  headerText: string;
  /** 작은 배지 (bg + text) */
  badge: string;
  /** 패널 푸터 (bg + border + text) */
  footer: string;
  /** 요약 칩 (bg + text + ring) */
  chip: string;
};

export const CATEGORY_COLORS: Record<CategoryColorKey, CategoryColor> = {
  법인: {
    dot: 'bg-sky-500',
    text: 'text-sky-700',
    accent: 'border-l-sky-400',
    headerBg: 'bg-sky-50/80',
    headerText: 'text-sky-800',
    badge: 'bg-sky-100/90 text-sky-800',
    footer: 'bg-sky-50/60 border-sky-100/80 text-sky-900',
    chip: 'bg-sky-50 text-sky-800 ring-1 ring-sky-100',
  },
  개인: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    accent: 'border-l-emerald-400',
    headerBg: 'bg-emerald-50/80',
    headerText: 'text-emerald-800',
    badge: 'bg-emerald-100/90 text-emerald-800',
    footer: 'bg-emerald-50/60 border-emerald-100/80 text-emerald-900',
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
  },
  신고대리: {
    dot: 'bg-violet-500',
    text: 'text-violet-700',
    accent: 'border-l-violet-400',
    headerBg: 'bg-violet-50/80',
    headerText: 'text-violet-800',
    badge: 'bg-violet-100/90 text-violet-800',
    footer: 'bg-violet-50/70 border-violet-100/80 text-violet-900',
    chip: 'bg-violet-50 text-violet-800 ring-1 ring-violet-100',
  },
  지주택: {
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    accent: 'border-l-amber-400',
    headerBg: 'bg-amber-50/80',
    headerText: 'text-amber-800',
    badge: 'bg-amber-100/90 text-amber-800',
    footer: 'bg-amber-50/70 border-amber-100/80 text-amber-900',
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  },
};
