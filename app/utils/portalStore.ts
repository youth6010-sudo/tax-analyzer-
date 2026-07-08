'use client';

import { useSyncExternalStore } from 'react';
import type { DashboardTask } from '@/lib/dashboardTasks';
import type { ChurnRecordView, ClientRecord, ClientSearchResult } from '@/app/types/client';
import {
  buildChurnRegistrationIndex,
  clientMatchesChurnRegistration,
} from '@/app/utils/churnMatch';
import { filterClientSearchIndex } from '@/app/utils/searchFilter';

/** 유출 처리된 업체의 국세청 할 일을 목록에서 제거 */
export function filterNtsTasksForHandledChurn(
  tasks: DashboardTask[],
  churnRecords: ChurnRecordView[],
  clients: ClientRecord[],
): DashboardTask[] {
  if (!tasks.some(t => t.type === 'nts_alert')) return tasks;
  const index = buildChurnRegistrationIndex(churnRecords);
  const clientById = new Map(clients.map(c => [c.id, c]));

  return tasks.filter(t => {
    if (t.type !== 'nts_alert') return true;
    const m = /^nts-(.+)$/.exec(t.id);
    if (!m) return true;
    const client = clientById.get(m[1]);
    if (!client) return false;
    return !clientMatchesChurnRegistration(client, index);
  });
}

export type PortalHomeStats = {
  count: number;
  corporate: number;
  individual: number;
  nonBusiness: number;
  unclassified: number;
};

export type PortalBootstrap = {
  fetchedAt: number;
  userId?: string;
  tasks: DashboardTask[];
  homeStats: PortalHomeStats;
  clients: ClientRecord[];
  searchIndex: ClientSearchResult[];
  inquiries: Record<string, unknown>[];
  processes: Record<string, unknown>[];
  churnRecords: ChurnRecordView[];
  churnMissingClients: ClientRecord[];
};

const STORAGE_KEY = 'portalBootstrap:v9';
const SEARCH_INDEX_KEY = 'portalSearchIndex:v1';
const FRESH_MS = 90_000;
const SEARCH_FRESH_MS = 300_000;
const FETCH_TIMEOUT_MS = 15_000;

function emptyBootstrap(): PortalBootstrap {
  return {
    fetchedAt: Date.now(),
    tasks: [],
    homeStats: { count: 0, corporate: 0, individual: 0, nonBusiness: 0, unclassified: 0 },
    clients: [],
    searchIndex: [],
    inquiries: [],
    processes: [],
    churnRecords: [],
    churnMissingClients: [],
  };
}

let memory: PortalBootstrap | null = null;
let searchIndexMemory: ClientSearchResult[] | null = null;
let searchIndexFetchedAt = 0;
let bootstrapSyncError: string | null = null;
let inflight: Promise<PortalBootstrap | null> | null = null;
let searchInflight: Promise<ClientSearchResult[] | null> | null = null;
const listeners = new Set<() => void>();

function readStorage(): PortalBootstrap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalBootstrap;
    return {
      ...parsed,
      churnRecords: parsed.churnRecords ?? [],
      churnMissingClients: parsed.churnMissingClients ?? [],
    };
  } catch {
    return null;
  }
}

function writeStorage(data: PortalBootstrap): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, raw);
    sessionStorage.setItem(STORAGE_KEY, raw);
  } catch {
    try {
      const slim: PortalBootstrap = { ...data, clients: [], searchIndex: [] };
      const raw = JSON.stringify(slim);
      localStorage.setItem(STORAGE_KEY, raw);
      sessionStorage.setItem(STORAGE_KEY, raw);
    } catch {
      /* quota */
    }
  }
}

function readSearchIndexStorage(): ClientSearchResult[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SEARCH_INDEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; searchIndex: ClientSearchResult[] };
    searchIndexFetchedAt = parsed.fetchedAt ?? 0;
    return parsed.searchIndex ?? [];
  } catch {
    return null;
  }
}

function writeSearchIndexStorage(searchIndex: ClientSearchResult[]): void {
  if (typeof window === 'undefined') return;
  try {
    searchIndexFetchedAt = Date.now();
    localStorage.setItem(
      SEARCH_INDEX_KEY,
      JSON.stringify({ fetchedAt: searchIndexFetchedAt, searchIndex }),
    );
  } catch {
    /* quota */
  }
}

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') {
  memory = readStorage();
  searchIndexMemory = readSearchIndexStorage();
}

export function getPortalSyncError(): string | null {
  return bootstrapSyncError;
}

export function clearPortalSyncError(): void {
  bootstrapSyncError = null;
  notify();
}

export function usePortalSyncError(): string | null {
  return useSyncExternalStore(subscribePortal, getPortalSyncError, () => null);
}

export function getPortalBootstrap(): PortalBootstrap | null {
  return memory;
}

const EMPTY_CLIENTS: ClientRecord[] = [];
const EMPTY_TASKS: DashboardTask[] = [];

export function getPortalTasks(): DashboardTask[] {
  return memory?.tasks ?? EMPTY_TASKS;
}

export function getPortalHomeStats(): PortalHomeStats | null {
  return memory?.homeStats ?? null;
}

export function getPortalClients(): ClientRecord[] {
  return memory?.clients ?? EMPTY_CLIENTS;
}

/** SSR·hydration 시 빈 배열, 마운트 후 localStorage 캐시 반영 */
export function usePortalClients(): ClientRecord[] {
  return useSyncExternalStore(subscribePortal, getPortalClients, () => EMPTY_CLIENTS);
}

/** SSR·hydration 시 빈 배열, 마운트 후 localStorage 캐시 반영 */
export function usePortalTasks(): DashboardTask[] {
  return useSyncExternalStore(subscribePortal, getPortalTasks, () => EMPTY_TASKS);
}

export function getPortalSearchIndex(): ClientSearchResult[] {
  return searchIndexMemory ?? memory?.searchIndex ?? [];
}

export function searchPortalClients(query: string, opts?: { activeOnly?: boolean }): ClientSearchResult[] {
  const index = searchIndexMemory ?? memory?.searchIndex;
  if (!index?.length) return [];
  const hits = filterClientSearchIndex(index, query);
  if (opts?.activeOnly) return hits.filter(c => c.status === 'active');
  return hits;
}

export function getPortalInquiries(): Record<string, unknown>[] {
  return memory?.inquiries ?? [];
}

export function getPortalProcesses(): Record<string, unknown>[] {
  return memory?.processes ?? [];
}

export function getPortalChurnRecords(): ChurnRecordView[] {
  return memory?.churnRecords ?? [];
}

export function getPortalChurnMissingClients(): ClientRecord[] {
  return memory?.churnMissingClients ?? [];
}

export function patchPortalChurn(
  churnRecords: ChurnRecordView[],
  churnMissingClients: ClientRecord[],
): void {
  if (!memory) return;
  const tasks = filterNtsTasksForHandledChurn(
    memory.tasks ?? [],
    churnRecords,
    memory.clients ?? [],
  );
  memory = {
    ...memory,
    churnRecords,
    churnMissingClients,
    tasks,
    fetchedAt: Date.now(),
  };
  writeStorage(memory);
  notify();
}

/** 수임처 목록 캐시 — 수수료 등 인라인 수정 반영 */
export function patchPortalClient(id: string, patch: Partial<ClientRecord>): void {
  if (!memory?.clients?.length) return;
  const idx = memory.clients.findIndex(c => c.id === id);
  if (idx < 0) return;
  const clients = memory.clients.map(c => (c.id === id ? { ...c, ...patch } : c));
  memory = { ...memory, clients, fetchedAt: Date.now() };
  writeStorage(memory);
  notify();
}

/** 유입 프로세스 체크리스트 등 — bootstrap 캐시의 processes·tasks 갱신 */
export function patchPortalProcess(id: string, process: Record<string, unknown>): void {
  if (!memory) return;
  const processes = memory.processes ?? [];
  const idx = processes.findIndex(p => String(p.id) === id);
  const next =
    idx >= 0
      ? processes.map((p, i) => (i === idx ? { ...p, ...process } : p))
      : [process, ...processes];
  memory = { ...memory, processes: next, fetchedAt: Date.now() };
  writeStorage(memory);
  notify();
}

/** 체크리스트·수임처 수정 후 할 일 목록을 서버와 맞춤 */
export function refreshPortalBootstrap(): Promise<PortalBootstrap | null> {
  return prefetchPortal(true);
}

/** bootstrap TTL 내 prefetch가 패치를 덮지 않도록 fetchedAt 갱신 */
export function markPortalClientsFresh(): void {
  if (!memory) return;
  memory = { ...memory, fetchedAt: Date.now() };
  writeStorage(memory);
}

export function subscribePortal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 현재 로그인 사용자와 캐시 소유자가 다르면 캐시를 비운다.
 * 로그인/로그아웃 버튼 경로를 타지 않은 사용자 전환(예: 세션 만료 후 재로그인,
 * 다른 탭 로그인)에도 이전 사용자의 할 일이 남지 않도록 보장한다.
 */
export function reconcilePortalUser(currentUserId: string | null | undefined): void {
  if (!currentUserId) return;
  if (memory && memory.userId && memory.userId !== currentUserId) {
    clearPortal();
  }
}

/**
 * 사용자 전환(로그인·로그아웃) 시 호출.
 * 이전 사용자의 할 일·수임처 캐시가 다음 사용자에게 노출되지 않도록 비운다.
 */
export function clearPortal(): void {
  memory = null;
  searchIndexMemory = null;
  searchIndexFetchedAt = 0;
  bootstrapSyncError = null;
  inflight = null;
  searchInflight = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SEARCH_INDEX_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}

export function patchPortalIntake(
  inquiries: Record<string, unknown>[],
  processes: Record<string, unknown>[],
): void {
  if (!memory) memory = readStorage();
  if (!memory) return;
  memory = { ...memory, inquiries, processes, fetchedAt: Date.now() };
  writeStorage(memory);
  notify();
}

export function prefetchPortal(force = false): Promise<PortalBootstrap | null> {
  const intakeLikelyStale =
    memory &&
    memory.clients.length > 0 &&
    !(memory.inquiries?.length) &&
    !(memory.processes?.length);
  if (
    !force &&
    !intakeLikelyStale &&
    memory &&
    Date.now() - memory.fetchedAt < FRESH_MS
  ) {
    return Promise.resolve(memory);
  }
  if (inflight) return inflight;

  inflight = fetch('/api/portal/bootstrap', {
    credentials: 'same-origin',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
    .then(async res => {
      if (!res.ok) {
        if (res.status === 401) {
          clearPortal();
          bootstrapSyncError = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
        } else {
          bootstrapSyncError =
            res.status >= 500
              ? '서버 오류로 데이터를 불러오지 못했습니다. 입력이 저장되지 않을 수 있습니다.'
              : `동기화 실패 (${res.status}). 새로고침 후 다시 시도해 주세요.`;
        }
        notify();
        return memory ?? emptyBootstrap();
      }
      const data = (await res.json()) as PortalBootstrap;
      bootstrapSyncError = null;
      memory = {
        ...data,
        churnRecords: data.churnRecords ?? [],
        churnMissingClients: data.churnMissingClients ?? [],
        tasks: filterNtsTasksForHandledChurn(
          data.tasks ?? [],
          data.churnRecords ?? [],
          data.clients ?? [],
        ),
      };
      writeStorage(memory);
      notify();
      return memory;
    })
    .catch(() => {
      bootstrapSyncError = '서버에 연결할 수 없습니다. 네트워크 또는 DB 설정을 확인해 주세요.';
      if (!memory) {
        memory = emptyBootstrap();
        writeStorage(memory);
      }
      notify();
      return memory;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function prefetchSearchIndex(force = false): Promise<ClientSearchResult[] | null> {
  if (!force && searchIndexMemory && Date.now() - searchIndexFetchedAt < SEARCH_FRESH_MS) {
    return Promise.resolve(searchIndexMemory);
  }
  if (searchInflight) return searchInflight;

  searchInflight = fetch('/api/portal/search-index', {
    credentials: 'same-origin',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
    .then(async res => {
      if (!res.ok) return searchIndexMemory;
      const data = (await res.json()) as { searchIndex: ClientSearchResult[] };
      searchIndexMemory = data.searchIndex ?? [];
      writeSearchIndexStorage(searchIndexMemory);
      if (memory) {
        memory = { ...memory, searchIndex: searchIndexMemory };
        writeStorage(memory);
      }
      notify();
      return searchIndexMemory;
    })
    .catch(() => searchIndexMemory)
    .finally(() => {
      searchInflight = null;
    });

  return searchInflight;
}

export function hydratePortal(): PortalBootstrap | null {
  if (!memory) memory = readStorage();
  void prefetchPortal();
  return memory;
}
