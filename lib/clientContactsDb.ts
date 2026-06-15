import { asc, desc, eq } from 'drizzle-orm';
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
