'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** 표 머리글 「제목 ▼」 트리거 + 팝오버 */
export function HeaderPopover({
  label,
  activeCount,
  title,
  align = 'left',
  children,
}: {
  label: string;
  /** 0이면 비활성 표시, 양수면 파란 배지 */
  activeCount: number;
  title?: string;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const active = activeCount > 0;
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={title}
        className={`inline-flex items-center gap-1 ${active ? 'text-blue-700' : ''}`}
      >
        <span>{label}</span>
        {active ? (
          <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-800">{activeCount}</span>
        ) : null}
        <span className={`text-[10px] ${active ? 'text-blue-600' : 'text-slate-400'}`}>▼</span>
      </button>
      {open ? (
        <div
          className={`absolute top-full z-20 mt-1 min-w-[9rem] rounded-lg border border-slate-200 bg-white p-1.5 text-left text-xs font-normal text-slate-700 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** 표 머리글용 다중선택 필터 (담당자·날짜 등) */
export default function ManagerMultiFilter({
  options,
  value,
  onChange,
  isLocked,
  headerLabel,
  formatOption,
  searchable,
  align,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  /** true면 선택 불가 (일반 담당은 본인만) */
  isLocked?: (name: string) => boolean;
  /** 머리글 「라벨 ▼」 트리거 문구 */
  headerLabel: string;
  formatOption?: (v: string) => string;
  /** 팝오버 안에 옵션 검색칸 표시 */
  searchable?: boolean;
  align?: 'left' | 'right';
}) {
  const [q, setQ] = useState('');
  const fmt = formatOption ?? ((v: string) => v);
  const qn = q.replace(/\s+/g, '').toLowerCase();
  const shown = qn ? options.filter(o => fmt(o).replace(/\s+/g, '').toLowerCase().includes(qn)) : options;

  const list = (
    <>
      {searchable ? (
        <input
          className="mb-1 h-6 w-full rounded-md border border-slate-300 px-1.5 text-xs outline-none focus:border-blue-400"
          placeholder="검색"
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
        />
      ) : null}
      <button
        type="button"
        className="mb-1 w-full rounded px-2 py-1 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50"
        onClick={() => onChange([])}
      >
        전체
      </button>
      <div className="max-h-64 overflow-y-auto">
        {shown.map(n => {
          const locked = isLocked?.(n) ?? false;
          return (
            <label
              key={n}
              title={locked ? '본인 담당만 선택할 수 있습니다' : undefined}
              className={`flex items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-xs font-normal ${
                locked ? 'cursor-not-allowed text-slate-300' : 'cursor-pointer text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={value.includes(n)}
                disabled={locked}
                onChange={() => onChange(value.includes(n) ? value.filter(x => x !== n) : [...value, n])}
              />
              {fmt(n)}
            </label>
          );
        })}
        {shown.length === 0 ? <div className="px-2 py-1 text-slate-400">없음</div> : null}
      </div>
    </>
  );

  return (
    <HeaderPopover
      label={headerLabel}
      activeCount={value.length}
      title={value.length ? value.map(fmt).join(', ') : `${headerLabel} 선택`}
      align={align}
    >
      {list}
    </HeaderPopover>
  );
}
