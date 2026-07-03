import type { ClientRecord } from '@/app/types/client';
import {
  applyClientDisplayOrder,
  MANAGER_DISPLAY_ORDER,
  UNCategorized,
} from '@/app/utils/clientsGrouping';

export type ClientSortKey = 'name' | 'code';

export const CLIENT_SORT_STORAGE_KEY = 'clients.sort.v1';
export const MANAGER_ORDER_STORAGE_KEY = 'clients.managerOrder.v1';
export const MANAGER_CLIENT_ORDER_STORAGE_KEY = 'clients.managerClientOrder.v1';

export type ManagerClientOrderStore = Record<string, string[]>;

export function readClientSort(): ClientSortKey {
  if (typeof window === 'undefined') return 'code';
  try {
    const v = localStorage.getItem(CLIENT_SORT_STORAGE_KEY);
    if (v === 'name' || v === 'code') return v;
  } catch {
    /* ignore */
  }
  return 'code';
}

export function writeClientSort(sort: ClientSortKey): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLIENT_SORT_STORAGE_KEY, sort);
    window.dispatchEvent(new Event(`local-storage:${CLIENT_SORT_STORAGE_KEY}`));
  } catch {
    /* ignore */
  }
}

export function readManagerOrder(): string[] {
  if (typeof window === 'undefined') return [...MANAGER_DISPLAY_ORDER];
  try {
    const raw = localStorage.getItem(MANAGER_ORDER_STORAGE_KEY);
    if (!raw) return [...MANAGER_DISPLAY_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...MANAGER_DISPLAY_ORDER];
    const valid = parsed.filter((m): m is string => typeof m === 'string' && m.trim().length > 0);
    return valid.length > 0 ? valid : [...MANAGER_DISPLAY_ORDER];
  } catch {
    return [...MANAGER_DISPLAY_ORDER];
  }
}

export function compareManagersByOrder(
  a: string,
  b: string,
  order: readonly string[],
  uncategorized = UNCategorized,
): number {
  if (a === uncategorized) return 1;
  if (b === uncategorized) return -1;
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  const ra = ia >= 0 ? ia : Number.MAX_SAFE_INTEGER;
  const rb = ib >= 0 ? ib : Number.MAX_SAFE_INTEGER;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, 'ko');
}

export function readManagerClientOrderStore(): ManagerClientOrderStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MANAGER_CLIENT_ORDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as ManagerClientOrderStore;
  } catch {
    return {};
  }
}

export function readManagerClientOrder(manager: string): string[] | null {
  const order = readManagerClientOrderStore()[manager];
  return order?.length ? order : null;
}

export function writeManagerClientOrder(manager: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readManagerClientOrderStore();
    store[manager] = ids;
    localStorage.setItem(MANAGER_CLIENT_ORDER_STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(`local-storage:${MANAGER_CLIENT_ORDER_STORAGE_KEY}`));
  } catch {
    /* ignore */
  }
}

/** 패널(법인/개인 등) 안에서 드래그한 순서를 담당자 전체 순서에 반영 */
export function commitClientListReorder(
  manager: string,
  reorderedSubsetIds: string[],
  allManagerClients: ClientRecord[],
  sort: ClientSortKey,
): void {
  const fullOrder = applyClientDisplayOrder(
    allManagerClients,
    sort,
    readManagerClientOrder(manager),
  ).map(c => c.id);
  const subsetSet = new Set(reorderedSubsetIds);
  const positions: number[] = [];
  fullOrder.forEach((id, i) => {
    if (subsetSet.has(id)) positions.push(i);
  });
  const next = [...fullOrder];
  for (let j = 0; j < reorderedSubsetIds.length && j < positions.length; j += 1) {
    next[positions[j]] = reorderedSubsetIds[j];
  }
  writeManagerClientOrder(manager, next);
}

/** 신고대상확인 — 담당자별(또는 전체 시 담당자 묶음) 대시보드 순서 적용 */
export function applyManagerScopedClientOrder(
  clients: ClientRecord[],
  sort: ClientSortKey,
  selManager: string,
  allManagersKey: string,
  managerOrder: readonly string[],
): ClientRecord[] {
  if (selManager !== allManagersKey) {
    return applyClientDisplayOrder(clients, sort, readManagerClientOrder(selManager));
  }
  const byMgr = new Map<string, ClientRecord[]>();
  for (const c of clients) {
    const m = c.manager?.trim() || UNCategorized;
    const arr = byMgr.get(m) ?? [];
    arr.push(c);
    byMgr.set(m, arr);
  }
  const result: ClientRecord[] = [];
  const mgrs = [...byMgr.keys()].sort((a, b) =>
    compareManagersByOrder(a, b, managerOrder, UNCategorized),
  );
  for (const m of mgrs) {
    result.push(...applyClientDisplayOrder(byMgr.get(m) ?? [], sort, readManagerClientOrder(m)));
  }
  return result;
}

/** 신고대상확인 전용 순서 — 담당자·세목별 (수임처 관리·대시보드와 분리) */
export const FILING_CHECK_CLIENT_ORDER_STORAGE_KEY = 'filingCheck.clientOrder.v1';

export type FilingCheckClientOrderStore = Record<string, string[]>;

export function filingCheckOrderScopeKey(manager: string, taxType: string): string {
  return `${manager}\t${taxType}`;
}

export function readFilingCheckClientOrderStore(): FilingCheckClientOrderStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FILING_CHECK_CLIENT_ORDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as FilingCheckClientOrderStore;
  } catch {
    return {};
  }
}

export function readFilingCheckClientOrder(manager: string, taxType: string): string[] | null {
  const order = readFilingCheckClientOrderStore()[filingCheckOrderScopeKey(manager, taxType)];
  return order?.length ? order : null;
}

export function writeFilingCheckClientOrder(manager: string, taxType: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readFilingCheckClientOrderStore();
    store[filingCheckOrderScopeKey(manager, taxType)] = ids;
    localStorage.setItem(FILING_CHECK_CLIENT_ORDER_STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(`local-storage:${FILING_CHECK_CLIENT_ORDER_STORAGE_KEY}`));
  } catch {
    /* ignore */
  }
}

function mergeSubsetIntoOrder(
  fullOrder: string[],
  reorderedSubsetIds: string[],
): string[] {
  const subsetSet = new Set(reorderedSubsetIds);
  const positions: number[] = [];
  fullOrder.forEach((id, i) => {
    if (subsetSet.has(id)) positions.push(i);
  });
  const next = [...fullOrder];
  for (let j = 0; j < reorderedSubsetIds.length && j < positions.length; j += 1) {
    next[positions[j]] = reorderedSubsetIds[j];
  }
  return next;
}

/** 신고대상확인 — 세목·담당자 범위 내 순서만 저장 (다른 화면에 영향 없음) */
export function commitFilingCheckClientReorder(
  manager: string,
  taxType: string,
  reorderedSubsetIds: string[],
  allTargetsInScope: ClientRecord[],
  sort: ClientSortKey,
): void {
  const scopeKey = filingCheckOrderScopeKey(manager, taxType);
  const store = readFilingCheckClientOrderStore();
  const existing = store[scopeKey];
  const managerFallback = readManagerClientOrder(manager);
  const fullOrder = applyClientDisplayOrder(
    allTargetsInScope,
    sort,
    existing?.length ? existing : managerFallback,
  ).map(c => c.id);
  writeFilingCheckClientOrder(manager, taxType, mergeSubsetIntoOrder(fullOrder, reorderedSubsetIds));
}

/** 신고대상확인 목록 순서 — 전용 순서 우선, 없으면 수임처 관리 순서를 초기값으로 사용 */
export function applyFilingCheckClientOrder(
  clients: ClientRecord[],
  sort: ClientSortKey,
  manager: string,
  taxType: string,
): ClientRecord[] {
  const custom = readFilingCheckClientOrder(manager, taxType);
  if (custom?.length) {
    return applyClientDisplayOrder(clients, sort, custom);
  }
  return applyClientDisplayOrder(clients, sort, readManagerClientOrder(manager));
}
