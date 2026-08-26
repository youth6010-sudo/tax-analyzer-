/** 개인별 사이드바·헤더 메뉴 표시/순서 */

import { TAX_MENU } from '@/app/config/taxTypes';

export type AcceptNewClientsPrefs = {
  individual: boolean;
  corporate: boolean;
};

export type UserMenuPrefs = {
  groupOrder?: string[];
  hiddenGroupIds?: string[];
  itemOrderByGroup?: Record<string, string[]>;
  hiddenHrefs?: string[];
  /** 수임가능(개인/법인) — 본인만 토글 */
  acceptNewClients?: AcceptNewClientsPrefs;
};

export function normalizeAcceptNewClients(raw: unknown): AcceptNewClientsPrefs | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  return {
    individual: o.individual === true,
    corporate: o.corporate === true,
  };
}

export type ResolvedMenuItem = {
  label: string;
  href: string;
  charlieOnly?: boolean;
};

export type ResolvedMenuGroup =
  | { id: string; label: string; href: string; adminOnly?: boolean }
  | { id: string; label: string; adminOnly?: boolean; items: ResolvedMenuItem[] };

export function emptyMenuPrefs(): UserMenuPrefs {
  return {};
}

export function normalizeMenuPrefs(raw: unknown): UserMenuPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyMenuPrefs();
  const o = raw as Record<string, unknown>;

  const groupOrder = Array.isArray(o.groupOrder)
    ? o.groupOrder.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : undefined;

  const hiddenGroupIds = Array.isArray(o.hiddenGroupIds)
    ? o.hiddenGroupIds.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : undefined;

  const hiddenHrefs = Array.isArray(o.hiddenHrefs)
    ? o.hiddenHrefs.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : undefined;

  let itemOrderByGroup: Record<string, string[]> | undefined;
  if (o.itemOrderByGroup && typeof o.itemOrderByGroup === 'object' && !Array.isArray(o.itemOrderByGroup)) {
    itemOrderByGroup = {};
    for (const [gid, list] of Object.entries(o.itemOrderByGroup as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      itemOrderByGroup[gid] = list.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
    }
  }

  const acceptNewClients = normalizeAcceptNewClients(o.acceptNewClients);

  return {
    ...(groupOrder?.length ? { groupOrder } : {}),
    ...(hiddenGroupIds?.length ? { hiddenGroupIds } : {}),
    ...(hiddenHrefs?.length ? { hiddenHrefs } : {}),
    ...(itemOrderByGroup && Object.keys(itemOrderByGroup).length ? { itemOrderByGroup } : {}),
    ...(acceptNewClients ? { acceptNewClients } : {}),
  };
}

function orderByKeys<T>(items: T[], keyOf: (item: T) => string, preferred?: string[]): T[] {
  if (!preferred?.length) return items;
  const map = new Map(items.map(item => [keyOf(item), item]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const key of preferred) {
    const hit = map.get(key);
    if (!hit || seen.has(key)) continue;
    out.push(hit);
    seen.add(key);
  }
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    out.push(item);
    seen.add(key);
  }
  return out;
}

/** 권한 필터 후 개인 prefs 적용 → 렌더용 메뉴 */
export function resolveMenuGroups(
  prefs: UserMenuPrefs | null | undefined,
  opts: { isAdmin: boolean; canCharlieFeatures: boolean },
): ResolvedMenuGroup[] {
  const normalized = normalizeMenuPrefs(prefs ?? {});
  const hiddenGroups = new Set(normalized.hiddenGroupIds ?? []);
  const hiddenHrefs = new Set(normalized.hiddenHrefs ?? []);

  const roleFiltered = TAX_MENU.filter(g => !('adminOnly' in g && g.adminOnly) || opts.isAdmin).map(
    (group): ResolvedMenuGroup | null => {
      if (hiddenGroups.has(group.id)) return null;

      if ('href' in group) {
        const href = group.href as string;
        if (hiddenHrefs.has(href)) return null;
        return {
          id: group.id,
          label: group.label,
          href,
          ...('adminOnly' in group && group.adminOnly ? { adminOnly: true as const } : {}),
        };
      }

      const items = group.items
        .filter(item => !('charlieOnly' in item && item.charlieOnly) || opts.canCharlieFeatures)
        .filter(item => !hiddenHrefs.has(item.href))
        .map(item => ({
          label: item.label,
          href: item.href,
          ...('charlieOnly' in item && item.charlieOnly ? { charlieOnly: true as const } : {}),
        }));

      const orderedItems = orderByKeys(
        items,
        i => i.href,
        normalized.itemOrderByGroup?.[group.id],
      );

      if (orderedItems.length === 0) return null;

      return {
        id: group.id,
        label: group.label,
        items: orderedItems,
        ...('adminOnly' in group && group.adminOnly ? { adminOnly: true as const } : {}),
      };
    },
  );

  const present = roleFiltered.filter((g): g is ResolvedMenuGroup => g != null);
  return orderByKeys(present, g => g.id, normalized.groupOrder);
}

/** 편집 UI용 — 숨김 포함·권한 필터만 적용한 카탈로그 스냅샷 */
export function catalogMenuForEdit(opts: {
  isAdmin: boolean;
  canCharlieFeatures: boolean;
}): ResolvedMenuGroup[] {
  return TAX_MENU.filter(g => !('adminOnly' in g && g.adminOnly) || opts.isAdmin).map(group => {
    if ('href' in group) {
      return {
        id: group.id,
        label: group.label,
        href: group.href as string,
        ...('adminOnly' in group && group.adminOnly ? { adminOnly: true as const } : {}),
      };
    }
    return {
      id: group.id,
      label: group.label,
      items: group.items
        .filter(item => !('charlieOnly' in item && item.charlieOnly) || opts.canCharlieFeatures)
        .map(item => ({
          label: item.label,
          href: item.href,
          ...('charlieOnly' in item && item.charlieOnly ? { charlieOnly: true as const } : {}),
        })),
      ...('adminOnly' in group && group.adminOnly ? { adminOnly: true as const } : {}),
    };
  });
}

export function buildPrefsFromEditState(state: {
  groupOrder: string[];
  hiddenGroupIds: string[];
  itemOrderByGroup: Record<string, string[]>;
  hiddenHrefs: string[];
}): UserMenuPrefs {
  return normalizeMenuPrefs({
    groupOrder: state.groupOrder,
    hiddenGroupIds: state.hiddenGroupIds,
    itemOrderByGroup: state.itemOrderByGroup,
    hiddenHrefs: state.hiddenHrefs,
  });
}
