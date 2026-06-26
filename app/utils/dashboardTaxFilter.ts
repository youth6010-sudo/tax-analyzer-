'use client';

import { useSyncExternalStore } from 'react';
import type { FilingTaxId } from '@/app/utils/filingCheck';

// 대시보드 세목 필터 — 인사 영역의 세목 아이콘과 수임처 보드가 공유하는 단순 스토어.
// 아무것도 선택 안 하면 null(전체 표시).
let selected: FilingTaxId | null = null;
const listeners = new Set<() => void>();

export function getDashboardTaxFilter(): FilingTaxId | null {
  return selected;
}

export function setDashboardTaxFilter(next: FilingTaxId | null): void {
  selected = next;
  for (const fn of listeners) fn();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDashboardTaxFilter(): FilingTaxId | null {
  return useSyncExternalStore(subscribe, getDashboardTaxFilter, () => null);
}
