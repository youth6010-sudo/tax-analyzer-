import type { ClientRecord } from '@/app/types/client';
import type { BusinessEntityType } from '@/app/types/contact';
import { BUSINESS_ENTITY_LABEL } from '@/app/types/contact';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import { resolveClientRecordFee } from '@/app/utils/feeBreakdown';

/** 수임처관리 시트 담당자 열 순서 */
export const MANAGER_DISPLAY_ORDER = Object.keys(STAFF_REAL_NAMES);


export const UNCategorized = '미분류';
export const SINGO_DAERI = '신고대리';
export const NON_BUSINESS_CATEGORY = '비사업자';
export const UNUSED_CATEGORY = '미사용';
export const JISUTAEK_CATEGORY = '지주택';

/** 수임처 대분류 필터·편집 선택지 */
export const CLIENT_MAIN_CATEGORIES = [
  '개인',
  '법인',
  SINGO_DAERI,
  JISUTAEK_CATEGORY,
  UNUSED_CATEGORY,
] as const;

export type ClientMainCategory = (typeof CLIENT_MAIN_CATEGORIES)[number];

/** import 시 빈 대분류로 취급하는 레거시 프로그램명 */
const LEGACY_EMPTY_CATEGORY_ALIASES = new Set(['세무사랑', '더존']);

function categoryFromEntityType(entityType: BusinessEntityType | '' | undefined): ClientMainCategory | null {
  if (entityType === 'corporate') return '법인';
  if (entityType === 'individual') return '개인';
  if (entityType === 'nonBusiness') return '개인';
  return null;
}

/**
 * 대분류 필터 칩용 버킷 — intakeData.category 원값 우선, 비어 있으면 구분(businessEntityType) fallback.
 * 표시용 getClientCategory()와 달리 필터·집계에만 사용한다.
 */
export function getClientCategoryForFilter(client: ClientRecord): ClientMainCategory | null {
  const s = getClientCategory(client);

  if ((CLIENT_MAIN_CATEGORIES as readonly string[]).includes(s)) {
    return s as ClientMainCategory;
  }

  if (s === NON_BUSINESS_CATEGORY) return '개인';

  if (s !== UNCategorized && s && !LEGACY_EMPTY_CATEGORY_ALIASES.has(s)) {
    return null;
  }

  return categoryFromEntityType(client.businessEntityType);
}

function isAllCategoryFiltersSelected(filters: readonly string[]): boolean {
  return (
    filters.length >= CLIENT_MAIN_CATEGORIES.length &&
    CLIENT_MAIN_CATEGORIES.every(c => filters.includes(c))
  );
}

export function matchesCategoryFilter(client: ClientRecord, filters: readonly string[]): boolean {
  if (filters.length === 0 || isAllCategoryFiltersSelected(filters)) return true;
  const cat = getClientCategoryForFilter(client);
  if (!cat) return false;
  return filters.includes(cat);
}

export function countClientsByMainCategory(clients: ClientRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cat of CLIENT_MAIN_CATEGORIES) counts.set(cat, 0);
  for (const c of clients) {
    const cat = getClientCategoryForFilter(c);
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return counts;
}

/** 구분·대분류 공통 표시 순서 */
export const GROUP_DISPLAY_ORDER = ['개인', '법인', SINGO_DAERI, UNUSED_CATEGORY, '비사업자'] as const;

/** UI 대분류 canonical (import·표시 공통) */
export const CANONICAL_CATEGORIES = new Set<string>(['개인', '법인', SINGO_DAERI, UNUSED_CATEGORY, '비사업자']);

export function getClientCategory(client: ClientRecord): string {
  const raw = client.intakeData?.category;
  const s = raw != null ? String(raw).trim() : '';
  return s || UNCategorized;
}

export type OtherCategoryGroup = {
  category: string;
  clients: ClientRecord[];
};

/** 담당자 컬럼: 대분류 === 개인 | 법인 | 그 외(분류별) — 필터와 동일한 버킷 기준 */
export function splitManagerClientsByCategory(clients: ClientRecord[]): {
  personal: ClientRecord[];
  corporate: ClientRecord[];
  otherCategories: OtherCategoryGroup[];
} {
  const personal: ClientRecord[] = [];
  const corporate: ClientRecord[] = [];
  const otherMap = new Map<string, ClientRecord[]>();

  for (const c of clients) {
    const raw = getClientCategory(c);
    let filterCat: ClientMainCategory | null = null;

    if ((CLIENT_MAIN_CATEGORIES as readonly string[]).includes(raw)) {
      filterCat = raw as ClientMainCategory;
    } else if (raw === NON_BUSINESS_CATEGORY) {
      filterCat = '개인';
    } else if (raw === UNCategorized || !raw || LEGACY_EMPTY_CATEGORY_ALIASES.has(raw)) {
      filterCat = categoryFromEntityType(c.businessEntityType);
    }

    if (filterCat === '개인') {
      personal.push(c);
    } else if (filterCat === '법인') {
      corporate.push(c);
    } else if (
      filterCat === SINGO_DAERI ||
      filterCat === JISUTAEK_CATEGORY ||
      filterCat === UNUSED_CATEGORY
    ) {
      const arr = otherMap.get(filterCat) ?? [];
      arr.push(c);
      otherMap.set(filterCat, arr);
    } else {
      const cat = getClientCategory(c);
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
export const RIGHT_COLUMN_LABELS = new Set<string>(['법인', UNUSED_CATEGORY, '비사업자']);

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

export function hasClientDouzoneCode(client: ClientRecord): boolean {
  return getClientDouzoneCode(client).length > 0;
}

/** 신고대리 — 개인·비사업자 사업자유형 */
export function isSingoDaeriPersonEntity(client: ClientRecord): boolean {
  const ent = client.businessEntityType;
  return ent === 'individual' || ent === 'nonBusiness' || ent === '';
}

/** 신고대리·비사업자 대분류 — 개인·비사업자 유형은 세무사랑 코드 있을 때 노출 */
function shouldShowPersonalCategoryRow(client: ClientRecord): boolean {
  if (!isSingoDaeriPersonEntity(client)) return true;
  return hasClientDouzoneCode(client);
}

export function shouldShowSingoDaeriClient(client: ClientRecord): boolean {
  if (getClientCategory(client) !== SINGO_DAERI) return false;
  return shouldShowPersonalCategoryRow(client);
}

export function shouldShowNonBusinessCategoryClient(client: ClientRecord): boolean {
  if (getClientCategory(client) !== NON_BUSINESS_CATEGORY) return false;
  return shouldShowPersonalCategoryRow(client);
}

/** 종소세·수임처 — 신고대리·비사업자 대분류 공통 노출 기준 */
export function shouldShowComprehensiveOptionalClient(client: ClientRecord): boolean {
  const cat = getClientCategory(client);
  if (cat === SINGO_DAERI) return shouldShowSingoDaeriClient(client);
  if (cat === NON_BUSINESS_CATEGORY) return shouldShowNonBusinessCategoryClient(client);
  return true;
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

export function sortClientRecords(clients: ClientRecord[], sort: 'name' | 'code'): ClientRecord[] {
  const list = [...clients];
  if (sort === 'name') {
    list.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  } else {
    list.sort(compareClientsByDouzoneCode);
  }
  return list;
}

function sortClients(clients: ClientRecord[], sort: 'name' | 'code'): ClientRecord[] {
  return sortClientRecords(clients, sort);
}

/** 신고대상확인 등 — 세션 커스텀 순서 + 기본 정렬 병합 */
export function applyClientDisplayOrder(
  clients: ClientRecord[],
  sort: 'name' | 'code',
  customOrder?: string[] | null,
): ClientRecord[] {
  const sorted = sortClientRecords(clients, sort);
  if (!customOrder?.length) return sorted;
  const byId = new Map(sorted.map(c => [c.id, c]));
  const result: ClientRecord[] = [];
  for (const id of customOrder) {
    const c = byId.get(id);
    if (c) {
      result.push(c);
      byId.delete(id);
    }
  }
  for (const c of sorted) {
    if (byId.has(c.id)) result.push(c);
  }
  return result;
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
    const cat = getClientCategoryForFilter(c);
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
