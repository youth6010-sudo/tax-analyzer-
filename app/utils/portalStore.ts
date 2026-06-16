'use client';

import type { DashboardTask } from '@/lib/dashboardTasks';
import type { ClientRecord, ClientSearchResult } from '@/app/types/client';
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
};

const STORAGE_KEY = 'portalBootstrap:v3';
const FRESH_MS = 45_000;

let memory: PortalBootstrap | null = null;
let inflight: Promise<PortalBootstrap | null> | null = null;
const listeners = new Set<() => void>();

function readStorage(): PortalBootstrap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PortalBootstrap;
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

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') {
  memory = readStorage();
}

export function getPortalBootstrap(): PortalBootstrap | null {
  return memory;
}

export function getPortalTasks(): DashboardTask[] {
  return memory?.tasks ?? [];
}

export function getPortalHomeStats(): PortalHomeStats | null {
  return memory?.homeStats ?? null;
}

export function getPortalClients(): ClientRecord[] {
  return memory?.clients ?? [];
}

export function getPortalSearchIndex(): ClientSearchResult[] {
  return memory?.searchIndex ?? [];
}

export function searchPortalClients(query: string): ClientSearchResult[] {
  const index = memory?.searchIndex;
  if (!index?.length) return [];
  return filterClientSearchIndex(index, query);
}

export function getPortalInquiries(): Record<string, unknown>[] {
  return memory?.inquiries ?? [];
}

export function getPortalProcesses(): Record<string, unknown>[] {
  return memory?.processes ?? [];
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
      memory = data;
      writeStorage(data);
      notify();
      return data;
    })
    .catch(() => memory)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function hydratePortal(): PortalBootstrap | null {
  if (!memory) memory = readStorage();
  void prefetchPortal();
  return memory;
}
