'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LunchSpot } from '@/app/types/lunch';

// v2: 초기 배포 때 시험 토글로 가챠에 섞인 비활성 식당을 한 번 정리하기 위해 키 갱신
const STORAGE_KEY = 'lunch.activeOverrides.v2';

// 식당 활성/비활성은 JSON(active)이 기본값. 사용자가 이 브라우저에서 토글하면
// localStorage 에 override 로 저장돼, 기본값보다 우선 적용된다.
export function useLunchActiveOverrides() {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOverrides(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // 무시
    }
  }, []);

  const setActive = useCallback((spotId: string, active: boolean) => {
    setOverrides(prev => {
      const next = { ...prev, [spotId]: active };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 무시
      }
      return next;
    });
  }, []);

  // 기본값(spot.active)에 override 를 덮어쓴 실효 active 를 반영한 목록
  const applyOverrides = useCallback(
    (spots: LunchSpot[]): LunchSpot[] =>
      spots.map(s => {
        const o = overrides[s.id];
        return o === undefined ? s : { ...s, active: o };
      }),
    [overrides],
  );

  return { overrides, setActive, applyOverrides };
}
