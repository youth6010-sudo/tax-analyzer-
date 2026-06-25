export type ClientsListSort = 'name' | 'code';

export type ClientsListState = {
  q: string;
  sort: ClientsListSort;
  mineOnly: boolean;
  includeChurned: boolean;
  entity: string;
  /** 담당자별 보기에서 표시할 담당자 */
  visibleManagers: string[];
  /** opt-in 대분류 (신고대리·미사용·legacy) */
  visibleOptionalCategories: string[];
  manager: string;
  scroll: number;
};

export const DEFAULT_CLIENTS_LIST_STATE: ClientsListState = {
  q: '',
  sort: 'name',
  mineOnly: true,
  includeChurned: false,
  entity: '',
  visibleManagers: [],
  visibleOptionalCategories: [],
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

  const catRaw = params.get('cat') ?? '';
  const visibleOptionalCategories = catRaw
    ? catRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return {
    q: params.get('q') ?? '',
    sort: params.get('sort') === 'code' || params.get('sort') === 'fee' ? 'code' : 'name',
    mineOnly: mine !== '0',
    includeChurned: params.get('includeChurned') === '1',
    entity: params.get('entity') ?? '',
    visibleManagers,
    visibleOptionalCategories,
    manager: params.get('manager') ?? '',
    scroll: scrollRaw ? Math.max(0, parseInt(scrollRaw, 10) || 0) : 0,
  };
}

export function buildClientsListUrl(state: ClientsListState, opts?: { includeScroll?: boolean }): string {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sort === 'code') p.set('sort', 'code');
  if (!state.mineOnly) p.set('mine', '0');
  if (state.includeChurned) p.set('includeChurned', '1');
  if (state.entity) p.set('entity', state.entity);
  if (state.visibleManagers.length > 0) p.set('mgr', state.visibleManagers.join(','));
  if (state.visibleOptionalCategories.length > 0) p.set('cat', state.visibleOptionalCategories.join(','));
  if (state.manager) p.set('manager', state.manager);
  if (opts?.includeScroll && state.scroll > 0) p.set('scroll', String(Math.round(state.scroll)));
  const qs = p.toString();
  return qs ? `/clients?${qs}` : '/clients';
}

export function buildClientDetailUrl(clientId: string, returnTo: string): string {
  return `/clients/${clientId}?from=${encodeURIComponent(returnTo)}`;
}
