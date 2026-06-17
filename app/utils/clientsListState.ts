export type ClientsListSort = 'name' | 'code';

export type ClientsListState = {
  q: string;
  sort: ClientsListSort;
  mineOnly: boolean;
  includeChurned: boolean;
  entity: string;
  /** 체크된 opt-in 대분류 (개인·법인 제외) */
  optionalCategories: string[];
  manager: string;
  scroll: number;
};

export const DEFAULT_CLIENTS_LIST_STATE: ClientsListState = {
  q: '',
  sort: 'name',
  mineOnly: true,
  includeChurned: false,
  entity: '',
  optionalCategories: [],
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

  return {
    q: params.get('q') ?? '',
    sort: params.get('sort') === 'code' || params.get('sort') === 'fee' ? 'code' : 'name',
    mineOnly: mine !== '0',
    includeChurned: params.get('includeChurned') === '1',
    entity: params.get('entity') ?? '',
    optionalCategories,
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
  if (state.optionalCategories.length > 0) p.set('opt', state.optionalCategories.join(','));
  if (state.manager) p.set('manager', state.manager);
  if (opts?.includeScroll && state.scroll > 0) p.set('scroll', String(Math.round(state.scroll)));
  const qs = p.toString();
  return qs ? `/clients?${qs}` : '/clients';
}

export function buildClientDetailUrl(clientId: string, returnTo: string): string {
  return `/clients/${clientId}?from=${encodeURIComponent(returnTo)}`;
}
