import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, personalChecklistItems } from '@/db/schema';
import type {
  ChecklistCategory,
  ChecklistTaxType,
  PersonalChecklistDto,
} from '@/app/types/calendar';
import { checklistTaxTypeFromRow, normalizeChecklistTaxType } from '@/app/types/calendar';
import { syncChecklistToClientNotes, unsyncChecklistFromClientNotes } from '@/lib/personalChecklistSync';
import { getClientById } from '@/lib/clientsDb';

function toDto(
  row: typeof personalChecklistItems.$inferSelect,
  clientName?: string,
): PersonalChecklistDto {
  return {
    id: row.id,
    ownerName: row.ownerName,
    clientId: row.clientId,
    clientName,
    title: row.title,
    category: row.category as ChecklistCategory,
    taxType: checklistTaxTypeFromRow(row),
    dueDate: row.dueDate,
    completed: row.completed,
    reflectInNotes: row.reflectInNotes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPersonalChecklistForOwner(
  ownerName: string,
  opts?: { includeCompleted?: boolean },
): Promise<PersonalChecklistDto[]> {
  const db = getDb();
  const conditions = [eq(personalChecklistItems.ownerName, ownerName)];
  if (!opts?.includeCompleted) {
    conditions.push(eq(personalChecklistItems.completed, false));
  }

  const rows = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .where(and(...conditions))
    .orderBy(asc(personalChecklistItems.sortOrder), desc(personalChecklistItems.createdAt));

  return rows.map(r => toDto(r.item, r.clientName?.trim() || undefined));
}

export async function listPersonalChecklistForClient(
  clientId: string,
  opts?: { includeCompleted?: boolean },
): Promise<PersonalChecklistDto[]> {
  const db = getDb();
  const conditions = [eq(personalChecklistItems.clientId, clientId)];
  if (!opts?.includeCompleted) {
    conditions.push(eq(personalChecklistItems.completed, false));
  }

  const rows = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .where(and(...conditions))
    .orderBy(desc(personalChecklistItems.completed), asc(personalChecklistItems.sortOrder));

  return rows.map(r => toDto(r.item, r.clientName?.trim() || undefined));
}

export async function listPersonalChecklistInRange(
  ownerNames: string[],
  from: string,
  to: string,
): Promise<PersonalChecklistDto[]> {
  const names = ownerNames.map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .where(and(
      inArray(personalChecklistItems.ownerName, names),
      sql`${personalChecklistItems.dueDate} != ''`,
      gte(personalChecklistItems.dueDate, from),
      lte(personalChecklistItems.dueDate, to),
    ))
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .orderBy(asc(personalChecklistItems.dueDate));

  return rows.map(r => toDto(r.item, r.clientName?.trim() || undefined));
}

export async function listPersonalChecklistInRangeForOwner(
  ownerName: string,
  from: string,
  to: string,
): Promise<PersonalChecklistDto[]> {
  return listPersonalChecklistInRange([ownerName], from, to);
}

export type CreateChecklistInput = {
  title: string;
  taxType: ChecklistTaxType;
  clientId?: string | null;
  dueDate?: string;
  reflectInNotes?: boolean;
};

export async function createPersonalChecklistItem(
  ownerName: string,
  input: CreateChecklistInput,
): Promise<PersonalChecklistDto> {
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error('제목을 입력하세요.');
  const dueDate = input.dueDate?.trim() || '';
  if (!dueDate) throw new Error('마감기한을 지정하세요.');

  const normalized = normalizeChecklistTaxType(input.taxType);

  const [row] = await db
    .insert(personalChecklistItems)
    .values({
      ownerName,
      title,
      category: normalized.category,
      taxType: normalized.taxType,
      clientId: input.clientId || null,
      dueDate,
      reflectInNotes: Boolean(input.reflectInNotes),
    })
    .returning();

  if (input.reflectInNotes && input.clientId) {
    const client = await getClientById(input.clientId);
    if (client) {
      await syncChecklistToClientNotes(client, row);
    }
  }

  let clientName: string | undefined;
  if (row.clientId) {
    const client = await getClientById(row.clientId);
    clientName = client?.companyName;
  }

  return toDto(row, clientName);
}

export type UpdateChecklistInput = Partial<{
  title: string;
  taxType: ChecklistTaxType;
  clientId: string | null;
  dueDate: string;
  completed: boolean;
  reflectInNotes: boolean;
}>;

export async function updatePersonalChecklistItem(
  id: string,
  ownerName: string,
  patch: UpdateChecklistInput,
): Promise<PersonalChecklistDto> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(personalChecklistItems)
    .where(and(eq(personalChecklistItems.id, id), eq(personalChecklistItems.ownerName, ownerName)))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  if (patch.dueDate !== undefined && !patch.dueDate.trim()) {
    throw new Error('마감기한을 지정하세요.');
  }

  const nextReflect = patch.reflectInNotes ?? existing.reflectInNotes;
  const nextClientId = patch.clientId !== undefined ? patch.clientId : existing.clientId;
  const nextTaxType = patch.taxType !== undefined
    ? patch.taxType
    : checklistTaxTypeFromRow(existing);
  const normalized = normalizeChecklistTaxType(nextTaxType);

  const [row] = await db
    .update(personalChecklistItems)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.clientId !== undefined ? { clientId: patch.clientId } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate.trim() } : {}),
      ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
      ...(patch.reflectInNotes !== undefined ? { reflectInNotes: patch.reflectInNotes } : {}),
      category: normalized.category,
      taxType: normalized.taxType,
      updatedAt: new Date(),
    })
    .where(eq(personalChecklistItems.id, id))
    .returning();

  const clientId = nextClientId;
  if (clientId) {
    const client = await getClientById(clientId);
    if (client) {
      if (existing.reflectInNotes && existing.clientId) {
        const prevClient = existing.clientId === clientId
          ? client
          : await getClientById(existing.clientId);
        if (prevClient) await unsyncChecklistFromClientNotes(prevClient, existing);
      }
      if (nextReflect) await syncChecklistToClientNotes(client, row);
    }
  } else if (existing.reflectInNotes && existing.clientId) {
    const prevClient = await getClientById(existing.clientId);
    if (prevClient) await unsyncChecklistFromClientNotes(prevClient, existing);
  }

  let clientName: string | undefined;
  if (row.clientId) {
    const client = await getClientById(row.clientId);
    clientName = client?.companyName;
  }

  return toDto(row, clientName);
}

export async function deletePersonalChecklistItem(id: string, ownerName: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(personalChecklistItems)
    .where(and(eq(personalChecklistItems.id, id), eq(personalChecklistItems.ownerName, ownerName)))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  if (existing.reflectInNotes && existing.clientId) {
    const client = await getClientById(existing.clientId);
    if (client) await unsyncChecklistFromClientNotes(client, existing);
  }

  await db.delete(personalChecklistItems).where(eq(personalChecklistItems.id, id));
}

export async function getPersonalChecklistById(id: string): Promise<PersonalChecklistDto | null> {
  const db = getDb();
  const [row] = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .where(eq(personalChecklistItems.id, id))
    .limit(1);

  if (!row) return null;
  return toDto(row.item, row.clientName?.trim() || undefined);
}
