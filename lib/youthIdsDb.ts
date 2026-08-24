import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import type { YouthIdCategory, YouthIdDoc, YouthIdEntry, YouthIdField } from '@/lib/youthIds';

const CONFIG_KEY = 'youth_ids';

function parseField(raw: unknown): YouthIdField | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  const value = typeof o.value === 'string' ? o.value : '';
  if (!label) return null;
  return { label, value, secret: o.secret === true ? true : undefined };
}

function parseEntry(raw: unknown): YouthIdEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (!id || !title) return null;
  const fields = Array.isArray(o.fields)
    ? o.fields.map(parseField).filter((f): f is YouthIdField => f != null)
    : [];
  return {
    id,
    title,
    owner: typeof o.owner === 'string' && o.owner.trim() ? o.owner.trim() : null,
    url: typeof o.url === 'string' && o.url.trim() ? o.url.trim() : undefined,
    note: typeof o.note === 'string' && o.note.trim() ? o.note.trim() : undefined,
    fields,
  };
}

function parseCategory(raw: unknown): YouthIdCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  if (!id || !label) return null;
  const entries = Array.isArray(o.entries)
    ? o.entries.map(parseEntry).filter((e): e is YouthIdEntry => e != null)
    : [];
  return {
    id,
    label,
    icon: typeof o.icon === 'string' && o.icon.trim() ? o.icon.trim() : undefined,
    entries,
  };
}

/** JSON/env/DB 원본 → 정규화된 문서 */
export function parseYouthIdDoc(raw: unknown): YouthIdDoc {
  if (!raw || typeof raw !== 'object') return { categories: [] };
  const o = raw as Record<string, unknown>;
  const categories = Array.isArray(o.categories)
    ? o.categories.map(parseCategory).filter((c): c is YouthIdCategory => c != null)
    : [];
  return { categories };
}

function loadYouthIdsFromEnv(): YouthIdDoc {
  const raw = process.env.YOUTH_IDS_JSON;
  if (!raw) return { categories: [] };
  try {
    return parseYouthIdDoc(JSON.parse(raw));
  } catch {
    return { categories: [] };
  }
}

/** DB 우선, 없으면 env YOUTH_IDS_JSON */
export async function loadYouthIdsAsync(): Promise<YouthIdDoc> {
  const stored = await getAppConfig<YouthIdDoc>(CONFIG_KEY);
  if (stored && Array.isArray(stored.categories) && stored.categories.length > 0) {
    return parseYouthIdDoc(stored);
  }
  return loadYouthIdsFromEnv();
}

export async function saveYouthIdsAsync(doc: YouthIdDoc): Promise<YouthIdDoc> {
  const normalized = parseYouthIdDoc(doc);
  await setAppConfig(CONFIG_KEY, normalized as unknown as Record<string, unknown>);
  return normalized;
}

export async function isYouthIdsConfiguredAsync(): Promise<boolean> {
  const doc = await loadYouthIdsAsync();
  return doc.categories.some(c => (c.entries?.length ?? 0) > 0);
}
