'use client';

import { useSyncExternalStore } from 'react';
import type { TaxTypeId } from '@/app/config/taxTypes';

// 대시보드 세목 필터 — 인사 영역의 세목 아이콘과 수임처 보드가 공유하는 단순 스토어.
// 아무것도 선택 안 하면 null(전체 표시).
let selected: TaxTypeId | null = null;
const listeners = new Set<() => void>();

export function getDashboardTaxFilter(): TaxTypeId | null {
  return selected;
}

export function setDashboardTaxFilter(next: TaxTypeId | null): void {
  selected = next;
  for (const fn of listeners) fn();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDashboardTaxFilter(): TaxTypeId | null {
  return useSyncExternalStore(subscribe, getDashboardTaxFilter, () => null);
}
