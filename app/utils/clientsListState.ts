export type ClientsListSort = 'name' | 'code';
export type ClientsListView = 'manager' | 'category';

export type ClientsListState = {
  q: string;
  sort: ClientsListSort;
  view: ClientsListView;
  mineOnly: boolean;
  includeChurned: boolean;
  entity: string;
  /** 체크된 opt-in 대분류 (개인·법인 제외) */
  optionalCategories: string[];
  /** 담당자별 보기에서 표시할 담당자 */
  visibleManagers: string[];
  manager: string;
  scroll: number;
};

export const DEFAULT_CLIENTS_LIST_STATE: ClientsListState = {
  q: '',
  sort: 'name',
  view: 'manager',
  mineOnly: true,
  includeChurned: false,
  entity: '',
  optionalCategories: [],
  visibleManagers: [],
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
  const optRaw = params.get('opt') ?? '';
  const optionalCategories = optRaw
    ? optRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const mgrRaw = params.get('mgr') ?? '';
  const visibleManagers = mgrRaw
    ? mgrRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return {
    q: params.get('q') ?? '',
    sort: params.get('sort') === 'code' || params.get('sort') === 'fee' ? 'code' : 'name',
    view: params.get('view') === 'category' ? 'category' : 'manager',
    mineOnly: mine !== '0',
    includeChurned: params.get('includeChurned') === '1',
    entity: params.get('entity') ?? '',
    optionalCategories,
    visibleManagers,
    manager: params.get('manager') ?? '',
    scroll: scrollRaw ? Math.max(0, parseInt(scrollRaw, 10) || 0) : 0,
  };
}

export function buildClientsListUrl(state: ClientsListState, opts?: { includeScroll?: boolean }): string {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sort === 'code') p.set('sort', 'code');
  if (state.view === 'category') p.set('view', 'category');
  if (!state.mineOnly) p.set('mine', '0');
  if (state.includeChurned) p.set('includeChurned', '1');
  if (state.entity) p.set('entity', state.entity);
  if (state.optionalCategories.length > 0) p.set('opt', state.optionalCategories.join(','));
  if (state.visibleManagers.length > 0) p.set('mgr', state.visibleManagers.join(','));
  if (state.manager) p.set('manager', state.manager);
  if (opts?.includeScroll && state.scroll > 0) p.set('scroll', String(Math.round(state.scroll)));
  const qs = p.toString();
  return qs ? `/clients?${qs}` : '/clients';
}

export function buildClientDetailUrl(clientId: string, returnTo: string): string {
  return `/clients/${clientId}?from=${encodeURIComponent(returnTo)}`;
}
