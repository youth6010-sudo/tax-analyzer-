import type { ClientSortKey } from '@/app/utils/clientListPrefs';
import { readClientSort } from '@/app/utils/clientListPrefs';

export type { ClientSortKey as ClientsListSort } from '@/app/utils/clientListPrefs';

export type ClientsListState = {
  q: string;
  sort: ClientSortKey;
  mineOnly: boolean;
  includeChurned: boolean;
  entity: string;
  /** 담당자별 보기에서 표시할 담당자 */
  visibleManagers: string[];
  /** 대분류 필터 (개인·법인·신고대리·지주택·미사용, 비어 있으면 전체) */
  categoryFilters: string[];
  manager: string;
  scroll: number;
};

export const DEFAULT_CLIENTS_LIST_STATE: ClientsListState = {
  q: '',
  sort: 'code',
  mineOnly: true,
  includeChurned: false,
  entity: '',
  visibleManagers: [],
  categoryFilters: [],
  manager: '',
  scroll: 0,
};

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

export function parseClientsListState(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): ClientsListState {
  const mine = params.get('mine');
  const scrollRaw = params.get('scroll');
  const mgrRaw = params.get('mgr') ?? '';
  const visibleManagers = mgrRaw
    ? mgrRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const catFilterRaw = params.get('catFilter') ?? '';
  const categoryFilters = catFilterRaw
    ? catFilterRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return {
    q: params.get('q') ?? '',
    sort:
      params.get('sort') === 'name'
        ? 'name'
        : params.get('sort') === 'code'
          ? 'code'
          : readClientSort(),
    mineOnly: mine !== '0',
    includeChurned: params.get('includeChurned') === '1',
    entity: params.get('entity') ?? '',
    visibleManagers,
    categoryFilters,
    manager: params.get('manager') ?? '',
    scroll: scrollRaw ? Math.max(0, parseInt(scrollRaw, 10) || 0) : 0,
  };
}

export function buildClientsListUrl(state: ClientsListState, opts?: { includeScroll?: boolean }): string {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sort === 'name') p.set('sort', 'name');
  if (!state.mineOnly) p.set('mine', '0');
  if (state.includeChurned) p.set('includeChurned', '1');
  if (state.entity) p.set('entity', state.entity);
  if (state.visibleManagers.length > 0) p.set('mgr', state.visibleManagers.join(','));
  if (state.categoryFilters.length > 0) p.set('catFilter', state.categoryFilters.join(','));
  if (state.manager) p.set('manager', state.manager);
  if (opts?.includeScroll && state.scroll > 0) p.set('scroll', String(Math.round(state.scroll)));
  const qs = p.toString();
  return qs ? `/clients?${qs}` : '/clients';
}

export function buildClientDetailUrl(clientId: string, returnTo: string): string {
  return `/clients/${clientId}?from=${encodeURIComponent(returnTo)}`;
}
