'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 280;
const MOVE_THRESHOLD = 6;

type DragState = {
  id: string;
  moved: boolean;
  longPress: boolean;
  timer: number | null;
  startX: number;
  startY: number;
};

export const REORDER_ID_ATTR = 'data-reorder-id';

export function useLongPressListReorder(
  itemIds: string[],
  onCommit: (nextIds: string[]) => void,
) {
  const [order, setOrder] = useState(itemIds);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const orderRef = useRef(order);
  const suppressClickRef = useRef(false);
  orderRef.current = order;

  useEffect(() => {
    if (!dragId) setOrder(itemIds);
  }, [itemIds, dragId]);

  const clearTimer = () => {
    if (drag.current?.timer) {
      clearTimeout(drag.current.timer);
      drag.current.timer = null;
    }
  };

  const endDrag = useCallback(() => {
    clearTimer();
    drag.current = null;
    setDragId(null);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressClickRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const timer = window.setTimeout(() => {
      if (drag.current?.id === id) {
        drag.current.longPress = true;
        setDragId(id);
      }
    }, LONG_PRESS_MS);
    drag.current = {
      id,
      moved: false,
      longPress: false,
      timer,
      startX: e.clientX,
      startY: e.clientY,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (
      Math.abs(e.clientX - d.startX) > MOVE_THRESHOLD ||
      Math.abs(e.clientY - d.startY) > MOVE_THRESHOLD
    ) {
      d.moved = true;
    }
    if (!d.longPress) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const target = el?.closest(`[${REORDER_ID_ATTR}]`) as HTMLElement | null;
    const overId = target?.getAttribute(REORDER_ID_ATTR);
    if (!overId || overId === d.id) return;
    setOrder(prev => {
      const from = prev.indexOf(d.id);
      const to = prev.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, d.id);
      return next;
    });
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (d?.longPress) {
      suppressClickRef.current = true;
      onCommit(orderRef.current);
    }
    endDrag();
  }, [onCommit, endDrag]);

  const consumeClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  const getItemProps = useCallback(
    (id: string) => ({
      [REORDER_ID_ATTR]: id,
      onPointerDown: (e: React.PointerEvent) => onPointerDown(e, id),
      onPointerMove,
      onPointerUp,
      onPointerCancel: endDrag,
      className: dragId === id ? 'cursor-grabbing opacity-70' : dragId ? 'cursor-grab' : '',
    }),
    [dragId, onPointerDown, onPointerMove, onPointerUp, endDrag],
  );

  return {
    orderedIds: dragId ? order : itemIds,
    dragId,
    isDragging: !!dragId,
    getItemProps,
    consumeClick,
  };
}
