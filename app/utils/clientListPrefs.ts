import type { ClientRecord } from '@/app/types/client';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import {
  applyClientDisplayOrder,
  MANAGER_DISPLAY_ORDER,
  sortClientRecords,
  splitManagerClientsByCategory,
  UNCategorized,
} from '@/app/utils/clientsGrouping';

export type ClientSortKey = 'name' | 'code';

export const CLIENT_SORT_STORAGE_KEY = 'clients.sort.v1';
export const MANAGER_ORDER_STORAGE_KEY = 'clients.managerOrder.v1';
export const MANAGER_CLIENT_ORDER_STORAGE_KEY = 'clients.managerClientOrder.v1';
export const ROSTER_COLUMN_WIDTH_STORAGE_KEY = 'clients.rosterColumnWidth.v1';
export const ROSTER_ENTITY_HEIGHTS_STORAGE_KEY = 'clients.rosterEntityHeights.v1';

export type RosterEntityHeightKey = 'corporate' | 'personal' | 'other';

export const DEFAULT_ROSTER_ENTITY_HEIGHTS: Record<RosterEntityHeightKey, number> = {
  corporate: 220,
  personal: 220,
  other: 160,
};

export const MIN_ROSTER_ENTITY_HEIGHT = 110;
/** 고정 상한 — 화면이 더 크면 getMaxRosterEntityHeight() 사용 */
export const MAX_ROSTER_ENTITY_HEIGHT = 2400;

export function getMaxRosterEntityHeight(): number {
  if (typeof window === 'undefined') return MAX_ROSTER_ENTITY_HEIGHT;
  return Math.max(MAX_ROSTER_ENTITY_HEIGHT, Math.round(window.innerHeight * 0.92));
}

export function readRosterEntityHeights(): Record<RosterEntityHeightKey, number> {
  if (typeof window === 'undefined') return { ...DEFAULT_ROSTER_ENTITY_HEIGHTS };
  try {
    const raw = localStorage.getItem(ROSTER_ENTITY_HEIGHTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROSTER_ENTITY_HEIGHTS };
    const parsed = JSON.parse(raw) as Partial<Record<RosterEntityHeightKey, number>>;
    const clamp = (n: unknown, fallback: number) => {
      const v = typeof n === 'number' ? n : Number(n);
      if (!Number.isFinite(v)) return fallback;
      return Math.min(getMaxRosterEntityHeight(), Math.max(MIN_ROSTER_ENTITY_HEIGHT, Math.round(v)));
    };
    return {
      corporate: clamp(parsed.corporate, DEFAULT_ROSTER_ENTITY_HEIGHTS.corporate),
      personal: clamp(parsed.personal, DEFAULT_ROSTER_ENTITY_HEIGHTS.personal),
      other: clamp(parsed.other, DEFAULT_ROSTER_ENTITY_HEIGHTS.other),
    };
  } catch {
    return { ...DEFAULT_ROSTER_ENTITY_HEIGHTS };
  }
}

export function writeRosterEntityHeights(
  next: Partial<Record<RosterEntityHeightKey, number>>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = readRosterEntityHeights();
    for (const key of ['corporate', 'personal', 'other'] as const) {
      if (next[key] != null) {
        payload[key] = Math.min(
          getMaxRosterEntityHeight(),
          Math.max(MIN_ROSTER_ENTITY_HEIGHT, Math.round(next[key]!)),
        );
      }
    }
    localStorage.setItem(ROSTER_ENTITY_HEIGHTS_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event(`local-storage:${ROSTER_ENTITY_HEIGHTS_STORAGE_KEY}`));
  } catch {
    /* ignore */
  }
}

/** 수임처 담당자 칸 기본·최소 너비 (이보다 줄일 수 없음) */
export const DEFAULT_ROSTER_COLUMN_WIDTH = 300;
export const MIN_ROSTER_COLUMN_WIDTH = DEFAULT_ROSTER_COLUMN_WIDTH;
export const MAX_ROSTER_COLUMN_WIDTH = 520;

export function readRosterColumnWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_ROSTER_COLUMN_WIDTH;
  try {
    const raw = localStorage.getItem(ROSTER_COLUMN_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_ROSTER_COLUMN_WIDTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_ROSTER_COLUMN_WIDTH;
    return Math.min(MAX_ROSTER_COLUMN_WIDTH, Math.max(MIN_ROSTER_COLUMN_WIDTH, Math.round(n)));
  } catch {
    return DEFAULT_ROSTER_COLUMN_WIDTH;
  }
}

export function writeRosterColumnWidth(width: number): void {
  if (typeof window === 'undefined') return;
  try {
    const next = Math.min(
      MAX_ROSTER_COLUMN_WIDTH,
      Math.max(MIN_ROSTER_COLUMN_WIDTH, Math.round(width)),
    );
    localStorage.setItem(ROSTER_COLUMN_WIDTH_STORAGE_KEY, String(next));
    window.dispatchEvent(new Event(`local-storage:${ROSTER_COLUMN_WIDTH_STORAGE_KEY}`));
  } catch {
    /* ignore */
  }
}

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
  const store = readManagerClientOrderStore();
  const direct = store[manager];
  if (direct?.length) return direct;
  for (const alias of getManagerMatchNames(manager)) {
    if (alias === manager) continue;
    const order = store[alias];
    if (order?.length) return order;
  }
  return null;
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

/**
 * 수임처관리와 동일한 표시 순서.
 * - 커스텀 순서 있으면 그대로
 * - 없으면 법인 → 개인 → 기타 대분류, 각 그룹 내 이름/코드 정렬
 *   (신고대상확인이 이름순으로 개인·법인을 섞지 않도록)
 */
export function applyManagerRosterDisplayOrder(
  clients: ClientRecord[],
  sort: ClientSortKey,
  customOrder?: string[] | null,
): ClientRecord[] {
  if (customOrder?.length) {
    return applyClientDisplayOrder(clients, sort, customOrder);
  }
  const { personal, corporate, otherCategories } = splitManagerClientsByCategory(clients);
  return [
    ...sortClientRecords(corporate, sort),
    ...sortClientRecords(personal, sort),
    ...otherCategories.flatMap(({ clients: list }) => sortClientRecords(list, sort)),
  ];
}

/** 패널(법인/개인 등) 안에서 드래그한 순서를 담당자 전체 순서에 반영 */
export function commitClientListReorder(
  manager: string,
  reorderedSubsetIds: string[],
  allManagerClients: ClientRecord[],
  sort: ClientSortKey,
): void {
  const fullOrder = applyManagerRosterDisplayOrder(
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

/** 신고대상확인 — 담당자별(또는 전체 시 담당자 묶음) 수임처관리 순서 적용 */
export function applyManagerScopedClientOrder(
  clients: ClientRecord[],
  sort: ClientSortKey,
  selManager: string,
  allManagersKey: string,
  managerOrder: readonly string[],
): ClientRecord[] {
  if (selManager !== allManagersKey) {
    return applyManagerRosterDisplayOrder(clients, sort, readManagerClientOrder(selManager));
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
    result.push(
      ...applyManagerRosterDisplayOrder(byMgr.get(m) ?? [], sort, readManagerClientOrder(m)),
    );
  }
  return result;
}

/** 신고대상확인 전용 순서 — 담당자·세목별 (수임처 관리·대시보드와 분리) */
export const FILING_CHECK_CLIENT_ORDER_STORAGE_KEY = 'filingCheck.clientOrder.v1';

export type FilingCheckClientOrderStore = Record<string, string[]>;

/**
 * 부가세는 기수마다 대상이 달라 기수를 키에 포함 (`vat` | `vat:1기 확정`).
 * 그 외 세목은 taxType 그대로.
 */
export function filingCheckOrderTaxKey(taxType: string, vatPhase?: string | null): string {
  if (taxType === 'vat' && vatPhase) return `vat:${vatPhase}`;
  return taxType;
}

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
  const store = readFilingCheckClientOrderStore();
  const managers = [manager, ...getManagerMatchNames(manager).filter(n => n !== manager)];
  for (const m of managers) {
    const order = store[filingCheckOrderScopeKey(m, taxType)];
    if (order?.length) return order;
    // 부가세 기수 키 → 예전 `vat` 키 fallback
    if (taxType.startsWith('vat:')) {
      const legacy = store[filingCheckOrderScopeKey(m, 'vat')];
      if (legacy?.length) return legacy;
    }
  }
  return null;
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

/** id 배열 커스텀 순서로 재배열 (없는 id는 맨 뒤 유지 순) */
export function applyIdDisplayOrder<T extends { id: string }>(
  items: T[],
  customOrder?: string[] | null,
): T[] {
  if (!customOrder?.length) return items;
  const byId = new Map(items.map(item => [item.id, item]));
  const result: T[] = [];
  for (const id of customOrder) {
    const item = byId.get(id);
    if (item) {
      result.push(item);
      byId.delete(id);
    }
  }
  for (const item of items) {
    if (byId.has(item.id)) result.push(item);
  }
  return result;
}

/** 검토표 부가세 등 — 신고대상확인(담당자·세목) 순서로 정렬 */
export function applyFilingCheckOrderToRows<T extends { id: string; manager?: string }>(
  items: T[],
  taxType: string,
  options?: {
    managerFilter?: string;
    managerOrder?: readonly string[];
  },
): T[] {
  if (!items.length) return items;
  const managerOrder = options?.managerOrder?.length
    ? options.managerOrder
    : readManagerOrder();
  const filter = options?.managerFilter?.trim();

  const sortOneManager = (list: T[], manager: string): T[] => {
    const custom = readFilingCheckClientOrder(manager, taxType);
    if (custom?.length) return applyIdDisplayOrder(list, custom);
    return applyIdDisplayOrder(list, readManagerClientOrder(manager));
  };

  if (filter) {
    return sortOneManager(items, filter);
  }

  const byMgr = new Map<string, T[]>();
  for (const item of items) {
    const m = (item.manager || '').trim() || UNCategorized;
    const arr = byMgr.get(m) ?? [];
    arr.push(item);
    byMgr.set(m, arr);
  }
  const mgrs = [...byMgr.keys()].sort((a, b) =>
    compareManagersByOrder(a, b, managerOrder, UNCategorized),
  );
  const result: T[] = [];
  for (const m of mgrs) {
    result.push(...sortOneManager(byMgr.get(m) ?? [], m));
  }
  return result;
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
  const fullOrder = applyManagerRosterDisplayOrder(
    allTargetsInScope,
    sort,
    existing?.length ? existing : managerFallback,
  ).map(c => c.id);
  writeFilingCheckClientOrder(manager, taxType, mergeSubsetIntoOrder(fullOrder, reorderedSubsetIds));
}

/** 신고대상확인 목록 순서 — 전용 순서 우선, 없으면 수임처관리(법인→개인) 순서를 초기값으로 사용 */
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
  return applyManagerRosterDisplayOrder(clients, sort, readManagerClientOrder(manager));
}

/** 담당자 전체 보기 — 담당자별 신고대상확인 순서(없으면 수임처관리)를 이어 붙임 */
export function applyManagerScopedFilingCheckOrder(
  clients: ClientRecord[],
  sort: ClientSortKey,
  selManager: string,
  allManagersKey: string,
  managerOrder: readonly string[],
  taxType: string,
): ClientRecord[] {
  if (selManager !== allManagersKey) {
    return applyFilingCheckClientOrder(clients, sort, selManager, taxType);
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
    result.push(...applyFilingCheckClientOrder(byMgr.get(m) ?? [], sort, m, taxType));
  }
  return result;
}
