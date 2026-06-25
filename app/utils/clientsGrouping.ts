import type { ClientRecord } from '@/app/types/client';
import type { BusinessEntityType } from '@/app/types/contact';
import { BUSINESS_ENTITY_LABEL } from '@/app/types/contact';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import { resolveClientRecordFee } from '@/app/utils/feeBreakdown';

/** 수임처관리 시트 담당자 열 순서 */
export const MANAGER_DISPLAY_ORDER = Object.keys(STAFF_REAL_NAMES);


export const UNCategorized = '미분류';
export const SINGO_DAERI = '신고대리';

/** 구분·대분류 공통 표시 순서 */
export const GROUP_DISPLAY_ORDER = ['개인', '법인', SINGO_DAERI, '미사용', '비사업자'] as const;

/** UI 대분류 canonical (import·표시 공통) */
export const CANONICAL_CATEGORIES = new Set<string>(['개인', '법인', SINGO_DAERI, '미사용', '비사업자']);

export function getClientCategory(client: ClientRecord): string {
  const raw = client.intakeData?.category;
  const s = raw != null ? String(raw).trim() : '';
  return s || UNCategorized;
}

export type OtherCategoryGroup = {
  category: string;
  clients: ClientRecord[];
};

/** 담당자 컬럼: 대분류 === 개인 | 법인 | 그 외(분류별) */
export function splitManagerClientsByCategory(clients: ClientRecord[]): {
  personal: ClientRecord[];
  corporate: ClientRecord[];
  otherCategories: OtherCategoryGroup[];
} {
  const personal: ClientRecord[] = [];
  const corporate: ClientRecord[] = [];
  const otherMap = new Map<string, ClientRecord[]>();

  for (const c of clients) {
    const cat = getClientCategory(c);
    if (cat === '개인') personal.push(c);
    else if (cat === '법인') corporate.push(c);
    else {
      const arr = otherMap.get(cat) ?? [];
      arr.push(c);
      otherMap.set(cat, arr);
    }
  }

  const otherCategories = [...otherMap.entries()]
    .sort(([a], [b]) => compareGroupLabels(a, b))
    .map(([category, list]) => ({ category, clients: list }));

  return { personal, corporate, otherCategories };
}

/** @deprecated splitManagerClientsByCategory 사용 */
export function splitClientsByRosterPanel(clients: ClientRecord[]) {
  const { personal, corporate } = splitManagerClientsByCategory(clients);
  return { personal, corporate };
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

export function collectOptionalCategories(clients: ClientRecord[]): string[] {
  return collectCategories(clients).filter(cat => !ALWAYS_VISIBLE_CATEGORIES.has(cat));
}

export function countMainCategoryClients(clients: ClientRecord[]): {
  personal: number;
  corporate: number;
  total: number;
} {
  let personal = 0;
  let corporate = 0;
  for (const c of clients) {
    const cat = getClientCategory(c);
    if (cat === '개인') personal++;
    else if (cat === '법인') corporate++;
  }
  return { personal, corporate, total: personal + corporate };
}

export type ManagerSection = {
  manager: string;
  clients: ClientRecord[];
};

export function compareManagers(a: string, b: string): number {
  if (a === UNCategorized) return 1;
  if (b === UNCategorized) return -1;
  const ia = MANAGER_DISPLAY_ORDER.indexOf(a);
  const ib = MANAGER_DISPLAY_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, 'ko');
}

export function sumClientFees(clients: ClientRecord[]): number {
  return clients.reduce((sum, c) => sum + (resolveClientRecordFee(c) ?? 0), 0);
}

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
    .sort(([a], [b]) => compareManagers(a, b))
    .map(([manager, list]) => ({
      manager,
      clients: sortClients(list, sort),
    }));
}
