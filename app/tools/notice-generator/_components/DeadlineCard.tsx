import { ACCENT_CLASSES } from '../_lib/taxTypes';
import type { DeadlineResult, TaxTypeMeta } from '../_lib/types';

type Props = {
  meta: TaxTypeMeta;
  deadline: DeadlineResult | null;
};

export default function DeadlineCard({ meta, deadline }: Props) {
  if (!deadline) return null;
  const accent = ACCENT_CLASSES[meta.accent];

  return (
    <section
      className={`animate-pop rounded-3xl border border-white ${accent.softBg} p-5 shadow-[0_12px_36px_-14px_rgba(244,114,182,0.45)] backdrop-blur-sm`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden>
          ⏰
        </span>
        <span className={`text-xs font-bold ${accent.text}`}>
          {meta.name} · {meta.rule}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {deadline.periodLabel}
        {deadline.coverage ? (
          <span className="text-slate-400"> · {deadline.coverage}</span>
        ) : null}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-xs text-slate-400">최종 신고·납부 기한</span>
        <span className="text-2xl font-extrabold tracking-tight text-slate-800">
          {deadline.finalText}
        </span>
      </div>

      {deadline.wasAdjusted ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">🎈 휴일 보정</span> · 법정기한{' '}
          {deadline.statutoryText}이(가){' '}
          {deadline.skipped.map(s => s.reason).join(', ')}에 해당하여 다음
          영업일로 자동 조정되었어요.
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-400">
          🍀 법정기한이 영업일이라 별도 보정 없음
        </div>
      )}
    </section>
  );
}
