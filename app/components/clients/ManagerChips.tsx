'use client';

import { useEffect, useRef, useState } from 'react';
import { managerChipColor, MANAGER_LEGEND_ORDER } from '@/lib/calendarManagerColors';

type Props = {
  /** 표시 순서대로 정렬된 담당자 전체 목록 */
  managers: string[];
  counts: Map<string, number>;
  /** 현재 조회 중(선택된) 담당자 */
  selected: string[];
  currentUserName?: string | null;
  /** 탭 → 해당 담당자 선택/해제(다중 선택) */
  onToggle: (manager: string) => void;
  /** 꾹 눌러 드래그로 순서 변경 후 확정 */
  onReorder: (next: string[]) => void;
};

const LONG_PRESS_MS = 280;
const MOVE_THRESHOLD = 6;

export default function ManagerChips({
  managers,
  counts,
  selected,
  currentUserName,
  onToggle,
  onReorder,
}: Props) {
  const [order, setOrder] = useState<string[]>(managers);
  const [dragMgr, setDragMgr] = useState<string | null>(null);
  const drag = useRef<{
    mgr: string;
    moved: boolean;
    longPress: boolean;
    timer: number | null;
    startX: number;
    startY: number;
  } | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  // 드래그 중이 아닐 때만 외부 순서와 동기화
  useEffect(() => {
    if (!dragMgr) setOrder(managers);
  }, [managers, dragMgr]);

  const clearTimer = () => {
    if (drag.current?.timer) {
      clearTimeout(drag.current.timer);
      drag.current.timer = null;
    }
  };

  const endDrag = () => {
    clearTimer();
    drag.current = null;
    setDragMgr(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, mgr: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const timer = window.setTimeout(() => {
      if (drag.current && drag.current.mgr === mgr) {
        drag.current.longPress = true;
        setDragMgr(mgr);
      }
    }, LONG_PRESS_MS);
    drag.current = {
      mgr,
      moved: false,
      longPress: false,
      timer,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) > MOVE_THRESHOLD || Math.abs(e.clientY - d.startY) > MOVE_THRESHOLD) {
      d.moved = true;
    }
    if (!d.longPress) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const target = el?.closest('[data-mgr]') as HTMLElement | null;
    const overMgr = target?.getAttribute('data-mgr');
    if (!overMgr || overMgr === d.mgr) return;
    setOrder(prev => {
      const from = prev.indexOf(d.mgr);
      const to = prev.indexOf(overMgr);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, d.mgr);
      return next;
    });
  };

  const handlePointerUp = (mgr: string) => {
    const d = drag.current;
    if (d?.longPress) {
      onReorder(orderRef.current);
    } else if (d && !d.moved) {
      onToggle(mgr);
    }
    endDrag();
  };

  return (
    <div className="flex flex-wrap gap-1">
      {order.map(mgr => {
        const count = counts.get(mgr) ?? 0;
        const isSel = selected.includes(mgr);
        const isSelf = currentUserName === mgr;
        const dragging = dragMgr === mgr;
        return (
          <button
            key={mgr}
            data-mgr={mgr}
            type="button"
            onPointerDown={e => handlePointerDown(e, mgr)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp(mgr)}
            onPointerCancel={endDrag}
            style={{ touchAction: 'none' }}
            className={[
              'inline-flex select-none items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
              dragging
                ? 'z-10 scale-105 border-blue-400 bg-blue-100 text-blue-900 shadow-md'
                : isSel
                  ? isSelf
                    ? 'border-blue-300 bg-blue-50 text-blue-950'
                    : 'border-slate-300 bg-slate-100 text-slate-900'
                  : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 ${managerChipColor(mgr, MANAGER_LEGEND_ORDER)}`}
              aria-hidden
            />
            {mgr}
            {isSelf && <span className="text-[9px] font-bold text-blue-600">나</span>}
            <span
              className={[
                'tabular-nums rounded px-1 py-px text-[10px] font-semibold',
                isSel ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500',
              ].join(' ')}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
