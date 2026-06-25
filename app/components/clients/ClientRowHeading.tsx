'use client';

type Props = {
  companyName: React.ReactNode;
  companyTitle: string;
  expanded: boolean;
  isChurned?: boolean;
  entityBadge?: string;
  onNameClick: (e: React.MouseEvent) => void;
  onPrefetch?: () => void;
  nameButtonClass: string;
};

export default function ClientRowHeading({
  companyName,
  companyTitle,
  expanded,
  isChurned,
  entityBadge,
  onNameClick,
  onPrefetch,
  nameButtonClass,
}: Props) {
  return (
    <button
      type="button"
      onClick={onNameClick}
      onMouseEnter={onPrefetch}
      className={[
        nameButtonClass,
        'w-full text-base text-left min-w-0 flex items-center gap-1.5',
        isChurned ? 'line-through decoration-red-300/80 text-slate-500' : '',
      ].join(' ')}
      title={expanded ? `${companyTitle} — 클릭하면 접기` : `${companyTitle} — 클릭하면 정보 표시`}
    >
      <span className="min-w-0 truncate">{companyName}</span>
      {entityBadge && (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold text-amber-800 bg-amber-100 ring-1 ring-amber-200/80">
          {entityBadge}
        </span>
      )}
    </button>
  );
}
