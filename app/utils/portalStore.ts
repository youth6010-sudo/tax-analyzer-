'use client';

import { useSyncExternalStore } from 'react';
import type { DashboardTask } from '@/lib/dashboardTasks';
import type { ChurnRecordView, ClientRecord, ClientSearchResult } from '@/app/types/client';
import { filterClientSearchIndex } from '@/app/utils/searchFilter';

export type PortalHomeStats = {
  count: number;
  corporate: number;
  individual: number;
  nonBusiness: number;
  unclassified: number;
};

export type PortalBootstrap = {
  fetchedAt: number;
  tasks: DashboardTask[];
  homeStats: PortalHomeStats;
  clients: ClientRecord[];
  searchIndex: ClientSearchResult[];
  inquiries: Record<string, unknown>[];
  processes: Record<string, unknown>[];
  churnRecords: ChurnRecordView[];
  churnMissingClients: ClientRecord[];
};

const STORAGE_KEY = 'portalBootstrap:v6';
const SEARCH_INDEX_KEY = 'portalSearchIndex:v1';
const FRESH_MS = 90_000;
const SEARCH_FRESH_MS = 300_000;

let memory: PortalBootstrap | null = null;
let searchIndexMemory: ClientSearchResult[] | null = null;
let searchIndexFetchedAt = 0;
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
    /* quota */
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
  memory = {
    ...memory,
    churnRecords,
    churnMissingClients,
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

export function prefetchPortal(force = false): Promise<PortalBootstrap | null> {
  if (!force && memory && Date.now() - memory.fetchedAt < FRESH_MS) {
    return Promise.resolve(memory);
  }
  if (inflight) return inflight;

  inflight = fetch('/api/portal/bootstrap', { credentials: 'same-origin' })
    .then(async res => {
      if (!res.ok) return memory;
      const data = (await res.json()) as PortalBootstrap;
      memory = {
        ...data,
        churnRecords: data.churnRecords ?? [],
        churnMissingClients: data.churnMissingClients ?? [],
      };
      writeStorage(memory);
      notify();
      return memory;
    })
    .catch(() => memory)
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

  searchInflight = fetch('/api/portal/search-index', { credentials: 'same-origin' })
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
