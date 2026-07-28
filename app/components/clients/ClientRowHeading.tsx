'use client';

type BadgeTone = 'amber' | 'sky' | 'violet';

export type ClientRowBadge = {
  label: string;
  tone?: BadgeTone;
};

const BADGE_TONE: Record<BadgeTone, string> = {
  amber: 'text-amber-800 bg-amber-100 ring-1 ring-amber-200/80',
  sky: 'text-sky-800 bg-sky-100 ring-1 ring-sky-200/80',
  violet: 'text-violet-800 bg-violet-100 ring-1 ring-violet-200/80',
};

type Props = {
  companyName: React.ReactNode;
  companyTitle: string;
  expanded: boolean;
  isChurned?: boolean;
  /** @deprecated entityBadge 대신 badges 사용 */
  entityBadge?: string;
  badges?: ClientRowBadge[];
  ntsClosed?: boolean;
  onNameClick: (e: React.MouseEvent) => void;
  onPrefetch?: () => void;
  nameButtonClass: string;
  reorderProps?: React.HTMLAttributes<HTMLButtonElement>;
  consumeReorderClick?: () => boolean;
};

export default function ClientRowHeading({
  companyName,
  companyTitle,
  expanded,
  isChurned,
  entityBadge,
  badges,
  ntsClosed,
  onNameClick,
  onPrefetch,
  nameButtonClass,
  reorderProps,
  consumeReorderClick,
}: Props) {
  const resolvedBadges: ClientRowBadge[] =
    badges?.length
      ? badges
      : entityBadge
        ? [{ label: entityBadge, tone: 'amber' }]
        : [];

  const { title: reorderTitle, ...restReorder } = reorderProps ?? {};
  void reorderTitle;
  const hint = reorderProps
    ? '꾹 눌러 순서 변경 · 짧게 누르면 정보 표시'
    : expanded
      ? '클릭하면 접기'
      : '클릭하면 정보 표시';

  return (
    <button
      type="button"
      onClick={e => {
        if (consumeReorderClick?.()) {
          e.preventDefault();
          return;
        }
        onNameClick(e);
      }}
      onMouseEnter={onPrefetch}
      {...restReorder}
      className={[
        nameButtonClass,
        'w-full text-xs text-left min-w-0 flex items-center gap-1',
        isChurned ? 'line-through decoration-red-300/80 text-slate-500' : '',
      ].join(' ')}
      title={companyTitle}
      aria-label={`${companyTitle} — ${hint}`}
    >
      <span className="min-w-0 flex-1 truncate">{companyName}</span>
      {ntsClosed && (
        <span className="shrink-0 rounded px-1 py-px text-[10px] font-semibold text-red-700 bg-red-100 ring-1 ring-red-200/80">
          폐업/휴업
        </span>
      )}
      {resolvedBadges.map(b => (
        <span
          key={b.label}
          className={`shrink-0 rounded px-1 py-px text-[10px] font-semibold ${BADGE_TONE[b.tone ?? 'amber']}`}
        >
          {b.label}
        </span>
      ))}
    </button>
  );
}
