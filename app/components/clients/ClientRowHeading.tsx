'use client';

type Props = {
  companyName: React.ReactNode;
  companyTitle: string;
  expanded: boolean;
  isChurned?: boolean;
  entityBadge?: string;
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
  ntsClosed,
  onNameClick,
  onPrefetch,
  nameButtonClass,
  reorderProps,
  consumeReorderClick,
}: Props) {
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
      {...reorderProps}
      className={[
        nameButtonClass,
        'w-full text-xs text-left min-w-0 flex items-center gap-1',
        isChurned ? 'line-through decoration-red-300/80 text-slate-500' : '',
      ].join(' ')}
      title={
        reorderProps
          ? '꾹 눌러 순서 변경 · 짧게 누르면 정보 표시'
          : expanded
            ? `${companyTitle} — 클릭하면 접기`
            : `${companyTitle} — 클릭하면 정보 표시`
      }
    >
      <span className="min-w-0 truncate">{companyName}</span>
      {ntsClosed && (
        <span className="shrink-0 rounded px-1 py-px text-[10px] font-semibold text-red-700 bg-red-100 ring-1 ring-red-200/80">
          폐업/휴업
        </span>
      )}
      {entityBadge && (
        <span className="shrink-0 rounded px-1 py-px text-[10px] font-semibold text-amber-800 bg-amber-100 ring-1 ring-amber-200/80">
          {entityBadge}
        </span>
      )}
    </button>
  );
}
