'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getArrearsChurnStatuses,
  getDefaultArrearsChurnStatuses,
  sanitizeArrearsChurnStatuses,
  setArrearsChurnStatuses,
  subscribeArrearsChurnStatuses,
  type ArrearsChurnStatusOption,
} from '@/app/types/arrears';

let loading: Promise<void> | null = null;

export function reloadArrearsChurnStatuses(): Promise<void> {
  loading = fetch('/api/arrears/churn-statuses', { cache: 'no-store' })
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      if (data?.items) setArrearsChurnStatuses(sanitizeArrearsChurnStatuses(data.items));
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

/** 미수관리·채권관리 공용 해임 구분 목록 (편집 결과가 열린 화면 모두에 반영) */
export function useArrearsChurnStatuses(): ArrearsChurnStatusOption[] {
  const list = useSyncExternalStore(
    subscribeArrearsChurnStatuses,
    getArrearsChurnStatuses,
    getDefaultArrearsChurnStatuses,
  );
  useEffect(() => {
    if (!loading) void reloadArrearsChurnStatuses();
  }, []);
  return list;
}

export async function saveArrearsChurnStatuses(items: ArrearsChurnStatusOption[]): Promise<void> {
  const res = await fetch('/api/arrears/churn-statuses', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
  setArrearsChurnStatuses(sanitizeArrearsChurnStatuses((data as { items?: unknown }).items));
}
