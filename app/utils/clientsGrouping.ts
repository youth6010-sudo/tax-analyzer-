import type { ClientRecord } from '@/app/types/client';
import type { BusinessEntityType } from '@/app/types/contact';
import { BUSINESS_ENTITY_LABEL } from '@/app/types/contact';
import type { CategoryColumnSide } from '@/app/utils/clientsColumnLayout';


export const UNCategorized = '미분류';
export const SINGO_DAERI = '신고대리';

/** 구분·대분류 공통 표시 순서 */
export const GROUP_DISPLAY_ORDER = ['개인', '법인', SINGO_DAERI, '미사용', '비사업자'] as const;

export function getClientCategory(client: ClientRecord): string {
  const raw = client.intakeData?.category;
  const s = raw != null ? String(raw).trim() : '';
  if (s) return s;
  const entity = client.businessEntityType;
  if (entity === 'corporate') return '법인';
  if (entity === 'individual') return '개인';
  if (entity === 'nonBusiness') return '비사업자';
  return UNCategorized;
}

export function getEntityLabel(entityType: BusinessEntityType | '' | undefined): string {
  if (!entityType) return UNCategorized;
  return BUSINESS_ENTITY_LABEL[entityType] ?? UNCategorized;
}

export function compareGroupLabels(a: string, b: string): number {
  const rank = (label: string) => {
    const idx = GROUP_DISPLAY_ORDER.indexOf(label as (typeof GROUP_DISPLAY_ORDER)[number]);
    if (idx >= 0) return idx;
    if (label === UNCategorized) return 900;
    return 100;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, 'ko');
}

/** 왼쪽 열: 개인 → 신고대리 … / 오른쪽 열: 법인 → 미사용 … */
export const LEFT_COLUMN_LABELS = new Set<string>(['개인', SINGO_DAERI]);
export const RIGHT_COLUMN_LABELS = new Set<string>(['법인', '미사용', '비사업자']);

/** 목록 기본 노출 대분류 */
export const ALWAYS_VISIBLE_CATEGORIES = new Set<string>(['개인', '법인']);

export function splitEntitiesByColumn(entities: EntityGroup[]): {
  left: EntityGroup[];
  right: EntityGroup[];
} {
  const left: EntityGroup[] = [];
  const right: EntityGroup[] = [];
  const rest: EntityGroup[] = [];

  for (const ent of entities) {
    if (LEFT_COLUMN_LABELS.has(ent.entityLabel)) left.push(ent);
    else if (RIGHT_COLUMN_LABELS.has(ent.entityLabel)) right.push(ent);
    else rest.push(ent);
  }

  const sortedRest = [...rest].sort((a, b) => compareGroupLabels(a.entityLabel, b.entityLabel));
  sortedRest.forEach((ent, i) => {
    if (i % 2 === 0) left.push(ent);
    else right.push(ent);
  });

  left.sort((a, b) => compareGroupLabels(a.entityLabel, b.entityLabel));
  right.sort((a, b) => compareGroupLabels(a.entityLabel, b.entityLabel));

  return { left, right };
}

export type EntityGroup = {
  entityLabel: string;
  clients: ClientRecord[];
};

export type ManagerGroup = {
  manager: string;
  entities: EntityGroup[];
  total: number;
};

export type CategoryGroup = {
  category: string;
  managers?: ManagerGroup[];
  entities?: EntityGroup[];
  total: number;
};

export function getClientDouzoneCode(client: ClientRecord): string {
  const raw = client.intakeData?.douzoneCode;
  return raw != null ? String(raw).trim() : '';
}

function compareClientsByDouzoneCode(a: ClientRecord, b: ClientRecord): number {
  const ca = getClientDouzoneCode(a);
  const cb = getClientDouzoneCode(b);
  if (!ca && !cb) return a.companyName.localeCompare(b.companyName, 'ko');
  if (!ca) return 1;
  if (!cb) return -1;
  const da = ca.replace(/\D/g, '');
  const db = cb.replace(/\D/g, '');
  if (da && db && /^\d+$/.test(da) && /^\d+$/.test(db)) {
    return parseInt(da, 10) - parseInt(db, 10);
  }
  return ca.localeCompare(cb, 'ko', { numeric: true });
}

function sortClients(clients: ClientRecord[], sort: 'name' | 'code'): ClientRecord[] {
  const list = [...clients];
  if (sort === 'name') {
    list.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  } else {
    list.sort(compareClientsByDouzoneCode);
  }
  return list;
}

/** 신고대리 대분류 안에서만 개인·비사업자 entity를 한 묶음으로 */
function entityLabelForGrouping(category: string, entityType: BusinessEntityType | '' | undefined): string {
  const label = getEntityLabel(entityType);
  if (category === SINGO_DAERI && (label === '개인' || label === '비사업자')) {
    return SINGO_DAERI;
  }
  return label;
}

function groupByEntity(
  clients: ClientRecord[],
  sort: 'name' | 'code',
  category: string,
): EntityGroup[] {
  const map = new Map<string, ClientRecord[]>();
  for (const c of clients) {
    const label = entityLabelForGrouping(category, c.businessEntityType);
    const arr = map.get(label) ?? [];
    arr.push(c);
    map.set(label, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => compareGroupLabels(a, b))
    .map(([entityLabel, list]) => ({
      entityLabel,
      clients: sortClients(list, sort),
    }));
}

export function groupClientsForList(
  clients: ClientRecord[],
  opts: { mineOnly: boolean; sort: 'name' | 'code' },
): CategoryGroup[] {
  const byCategory = new Map<string, ClientRecord[]>();
  for (const c of clients) {
    const cat = getClientCategory(c);
    const arr = byCategory.get(cat) ?? [];
    arr.push(c);
    byCategory.set(cat, arr);
  }

  const categories = [...byCategory.entries()].sort(([a], [b]) => compareGroupLabels(a, b));

  return categories.map(([category, catClients]) => {
    if (opts.mineOnly) {
      const entities = groupByEntity(catClients, opts.sort, category);
      return {
        category,
        entities,
        total: catClients.length,
      };
    }

    const byManager = new Map<string, ClientRecord[]>();
    for (const c of catClients) {
      const mgr = c.manager?.trim() || UNCategorized;
      const arr = byManager.get(mgr) ?? [];
      arr.push(c);
      byManager.set(mgr, arr);
    }

    const managers = [...byManager.entries()]
      .sort(([a], [b]) => compareGroupLabels(a, b))
      .map(([manager, mgrClients]) => ({
        manager,
        entities: groupByEntity(mgrClients, opts.sort, category),
        total: mgrClients.length,
      }));

    return {
      category,
      managers,
      total: catClients.length,
    };
  });
}

export function collectCategories(clients: ClientRecord[]): string[] {
  const set = new Set<string>();
  for (const c of clients) set.add(getClientCategory(c));
  return [...set].sort(compareGroupLabels);
}

/** 개인·법인 제외 opt-in 대분류 목록 */
export function getOptionalCategories(clients: ClientRecord[]): string[] {
  return collectCategories(clients).filter(cat => !ALWAYS_VISIBLE_CATEGORIES.has(cat));
}

export function filterClientsByCategoryVisibility(
  clients: ClientRecord[],
  visibleOptional: string[],
): ClientRecord[] {
  const visible = new Set(visibleOptional);
  return clients.filter(c => {
    const cat = getClientCategory(c);
    return ALWAYS_VISIBLE_CATEGORIES.has(cat) || visible.has(cat);
  });
}

export type ManagerSection = {
  manager: string;
  clients: ClientRecord[];
};

/** 담당자별 소그룹 — 미분류는 맨 뒤 */
export function groupClientsByManager(
  clients: ClientRecord[],
  sort: 'name' | 'code',
): ManagerSection[] {
  const map = new Map<string, ClientRecord[]>();
  for (const c of clients) {
    const mgr = c.manager?.trim() || UNCategorized;
    const arr = map.get(mgr) ?? [];
    arr.push(c);
    map.set(mgr, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === UNCategorized) return 1;
      if (b === UNCategorized) return -1;
      return a.localeCompare(b, 'ko');
    })
    .map(([manager, list]) => ({
      manager,
      clients: sortClients(list, sort),
    }));
}

/** 목록 UI — 왼쪽 개인·비사업 등 / 오른쪽 법인 */
export function splitClientsPersonalCorporate(
  clients: ClientRecord[],
  sort: 'name' | 'code',
): { personal: ClientRecord[]; corporate: ClientRecord[] } {
  const personal: ClientRecord[] = [];
  const corporate: ClientRecord[] = [];
  for (const c of clients) {
    if (c.businessEntityType === 'corporate') corporate.push(c);
    else personal.push(c);
  }
  return {
    personal: sortClients(personal, sort),
    corporate: sortClients(corporate, sort),
  };
}

export type CategorySection = {
  category: string;
  clients: ClientRecord[];
};

function splitSectionsByColumnLayout(
  sections: CategorySection[],
  layout: Record<string, CategoryColumnSide> | null,
): { left: CategorySection[]; right: CategorySection[] } {
  const left: CategorySection[] = [];
  const right: CategorySection[] = [];
  const rest: CategorySection[] = [];

  for (const sec of sections) {
    const custom = layout?.[sec.category];
    if (custom === 'left') left.push(sec);
    else if (custom === 'right') right.push(sec);
    else if (LEFT_COLUMN_LABELS.has(sec.category)) left.push(sec);
    else if (RIGHT_COLUMN_LABELS.has(sec.category)) right.push(sec);
    else rest.push(sec);
  }

  const sortedRest = [...rest].sort((a, b) => compareGroupLabels(a.category, b.category));
  sortedRest.forEach((sec, i) => {
    const side = layout?.[sec.category] ?? (i % 2 === 0 ? 'left' : 'right');
    if (side === 'right') right.push(sec);
    else left.push(sec);
  });

  left.sort((a, b) => compareGroupLabels(a.category, b.category));
  right.sort((a, b) => compareGroupLabels(a.category, b.category));

  return { left, right };
}

/** 대분류별 묶음 → 왼쪽·오른쪽 열에 세로로 쌓기 */
export function groupClientsByCategoryColumns(
  clients: ClientRecord[],
  sort: 'name' | 'code',
  columnLayout?: Record<string, CategoryColumnSide> | null,
): { left: CategorySection[]; right: CategorySection[] } {
  const byCategory = new Map<string, ClientRecord[]>();
  for (const c of clients) {
    const cat = getClientCategory(c);
    const arr = byCategory.get(cat) ?? [];
    arr.push(c);
    byCategory.set(cat, arr);
  }

  const sections: CategorySection[] = [...byCategory.entries()].map(([category, list]) => ({
    category,
    clients: sortClients(list, sort),
  }));

  return splitSectionsByColumnLayout(sections, columnLayout ?? null);
}
