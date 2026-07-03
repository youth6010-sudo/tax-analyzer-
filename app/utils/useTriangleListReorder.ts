'use client';

import { useCallback, useEffect, useState } from 'react';

/** 순번 열 ▲▼ 버튼으로 목록 순서 변경 */
export function useTriangleListReorder(itemIds: string[], onCommit: (nextIds: string[]) => void) {
  const [order, setOrder] = useState(itemIds);

  useEffect(() => {
    setOrder(itemIds);
  }, [itemIds]);

  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      setOrder(prev => {
        const from = prev.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= prev.length) return prev;
        const next = [...prev];
        next.splice(from, 1);
        next.splice(to, 0, id);
        onCommit(next);
        return next;
      });
    },
    [onCommit],
  );

  const moveUp = useCallback((id: string) => move(id, -1), [move]);
  const moveDown = useCallback((id: string) => move(id, 1), [move]);

  return { orderedIds: order, moveUp, moveDown };
}
