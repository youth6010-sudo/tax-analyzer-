import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { clientContacts } from '@/db/schema';
import type { ClientContactPayload, ClientContactRecord } from '@/app/types/clientContact';

function toRecord(row: typeof clientContacts.$inferSelect): ClientContactRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    role: row.role,
    phone: row.phone,
    mobilePhone: row.mobilePhone,
    contactKind: row.contactKind,
    isPrimary: row.isPrimary,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listClientContacts(clientId: string): Promise<ClientContactRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(clientContacts)
    .where(eq(clientContacts.clientId, clientId))
    .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name));
  return rows.map(toRecord);
}

export async function getPrimaryContact(clientId: string): Promise<ClientContactRecord | null> {
  const all = await listClientContacts(clientId);
  return all.find(c => c.isPrimary) ?? all[0] ?? null;
}

/** clientId → 주 연락처 이름 (is_primary 우선, 없으면 첫 연락처) */
export async function getPrimaryContactNamesByClientIds(
  clientIds: string[],
): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();

  const db = getDb();
  const rows = await db
    .select({
      clientId: clientContacts.clientId,
      name: clientContacts.name,
      isPrimary: clientContacts.isPrimary,
    })
    .from(clientContacts)
    .where(inArray(clientContacts.clientId, clientIds))
    .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name));

  const map = new Map<string, string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    if (row.isPrimary || !map.has(row.clientId)) {
      map.set(row.clientId, name);
    }
  }
  return map;
}

export type ContactSearchData = {
  contactNames: string[];
  searchText: string;
};

/** 헤더 검색 인덱스용 — 연락처 이름·역할·전화 전체 */
export async function getContactSearchDataByClientIds(
  clientIds: string[],
): Promise<Map<string, ContactSearchData>> {
  if (clientIds.length === 0) return new Map();

  const db = getDb();
  const rows = await db
    .select({
      clientId: clientContacts.clientId,
      name: clientContacts.name,
      role: clientContacts.role,
      phone: clientContacts.phone,
      mobilePhone: clientContacts.mobilePhone,
      contactKind: clientContacts.contactKind,
    })
    .from(clientContacts)
    .where(inArray(clientContacts.clientId, clientIds));

  const map = new Map<string, ContactSearchData>();
  for (const row of rows) {
    let entry = map.get(row.clientId);
    if (!entry) {
      entry = { contactNames: [], searchText: '' };
      map.set(row.clientId, entry);
    }
    const name = row.name.trim();
    if (name) entry.contactNames.push(name);
    const chunk = [name, row.role, row.phone, row.mobilePhone, row.contactKind]
      .map(s => (s ?? '').trim())
      .filter(Boolean)
      .join(' ');
    if (chunk) entry.searchText = entry.searchText ? `${entry.searchText} ${chunk}` : chunk;
  }
  return map;
}

export async function createClientContact(
  clientId: string,
  payload: ClientContactPayload,
): Promise<ClientContactRecord> {
  const db = getDb();
  if (payload.isPrimary) {
    await db.update(clientContacts).set({ isPrimary: false }).where(eq(clientContacts.clientId, clientId));
  }
  const [row] = await db
    .insert(clientContacts)
    .values({
      clientId,
      name: payload.name?.trim() ?? '',
      role: payload.role?.trim() ?? '',
      phone: payload.phone?.trim() ?? '',
      mobilePhone: payload.mobilePhone?.trim() ?? '',
      contactKind: payload.contactKind?.trim() ?? '',
      isPrimary: payload.isPrimary ?? false,
      source: 'manual',
    })
    .returning();
  return toRecord(row);
}

export async function updateClientContact(
  clientId: string,
  contactId: string,
  payload: ClientContactPayload,
): Promise<ClientContactRecord> {
  const db = getDb();
  if (payload.isPrimary) {
    await db.update(clientContacts).set({ isPrimary: false }).where(eq(clientContacts.clientId, clientId));
  }
  const patch: Partial<typeof clientContacts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (payload.name !== undefined) patch.name = payload.name.trim();
  if (payload.role !== undefined) patch.role = payload.role.trim();
  if (payload.phone !== undefined) patch.phone = payload.phone.trim();
  if (payload.mobilePhone !== undefined) patch.mobilePhone = payload.mobilePhone.trim();
  if (payload.contactKind !== undefined) patch.contactKind = payload.contactKind.trim();
  if (payload.isPrimary !== undefined) patch.isPrimary = payload.isPrimary;

  const [row] = await db
    .update(clientContacts)
    .set(patch)
    .where(eq(clientContacts.id, contactId))
    .returning();
  if (!row || row.clientId !== clientId) throw new Error('NOT_FOUND');
  return toRecord(row);
}

export async function deleteClientContact(clientId: string, contactId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(clientContacts).where(eq(clientContacts.id, contactId)).limit(1);
  if (!row || row.clientId !== clientId) throw new Error('NOT_FOUND');
  await db.delete(clientContacts).where(eq(clientContacts.id, contactId));
}

export async function upsertClientContactFromImport(row: {
  clientId: string;
  name: string;
  role: string;
  phone: string;
  mobilePhone: string;
  contactKind: string;
  isPrimary: boolean;
  excelKey: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(clientContacts)
    .values({
      clientId: row.clientId,
      name: row.name,
      role: row.role,
      phone: row.phone,
      mobilePhone: row.mobilePhone,
      contactKind: row.contactKind,
      isPrimary: row.isPrimary,
      source: 'douzone_contact_export',
      excelKey: row.excelKey,
    })
    .onConflictDoUpdate({
      target: clientContacts.excelKey,
      set: {
        name: row.name,
        role: row.role,
        phone: row.phone,
        mobilePhone: row.mobilePhone,
        contactKind: row.contactKind,
        isPrimary: row.isPrimary,
        updatedAt: new Date(),
      },
    });
}
