import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, personalChecklistItems } from '@/db/schema';
import type {
  ChecklistTaxType,
  PersonalChecklistDto,
  PersonalChecklistMemo,
} from '@/app/types/calendar';
import { checklistTaxTypeFromRow, normalizeChecklistTaxType } from '@/app/types/calendar';
import { syncChecklistToClientNotes, unsyncChecklistFromClientNotes } from '@/lib/personalChecklistSync';
import { getClientById } from '@/lib/clientsDb';

function normalizeAssignees(names: string[] | undefined | null, ownerName: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names ?? []) {
    const n = raw.trim();
    if (!n || n === ownerName || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function normalizeMemos(raw: unknown): PersonalChecklistMemo[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonalChecklistMemo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : '';
    const authorName = typeof rec.authorName === 'string' ? rec.authorName.trim() : '';
    const body = typeof rec.body === 'string' ? rec.body.trim() : '';
    const createdAt = typeof rec.createdAt === 'string' ? rec.createdAt : '';
    if (!id || !authorName || !body) continue;
    out.push({ id, authorName, body, createdAt: createdAt || new Date().toISOString() });
  }
  return out;
}

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
    category: row.category as PersonalChecklistDto['category'],
    taxType: checklistTaxTypeFromRow(row),
    dueDate: row.dueDate,
    completed: row.completed,
    reflectInNotes: row.reflectInNotes,
    assigneeNames: normalizeAssignees(
      (row.assigneeNames as string[] | null | undefined) ?? [],
      row.ownerName,
    ),
    memos: normalizeMemos(row.memos),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function canAccessItem(
  row: Pick<typeof personalChecklistItems.$inferSelect, 'ownerName' | 'assigneeNames'>,
  userName: string,
): boolean {
  if (row.ownerName === userName) return true;
  const assignees = (row.assigneeNames as string[] | null | undefined) ?? [];
  return assignees.some(n => n.trim() === userName);
}

/** 내가 작성했거나 담당자로 지정된 항목 */
export async function listPersonalChecklistForOwner(
  ownerName: string,
  opts?: { includeCompleted?: boolean },
): Promise<PersonalChecklistDto[]> {
  const db = getDb();
  const access = or(
    eq(personalChecklistItems.ownerName, ownerName),
    sql`${personalChecklistItems.assigneeNames} @> ${JSON.stringify([ownerName])}::jsonb`,
  );
  const conditions = opts?.includeCompleted
    ? [access]
    : [access, eq(personalChecklistItems.completed, false)];

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
  assigneeNames?: string[];
  /** 생성 시 첫 메모 (작성자 = owner) */
  memo?: string;
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
  const assigneeNames = normalizeAssignees(input.assigneeNames, ownerName);
  const memos: PersonalChecklistMemo[] = [];
  const memoBody = input.memo?.trim();
  if (memoBody) {
    memos.push({
      id: crypto.randomUUID(),
      authorName: ownerName,
      body: memoBody,
      createdAt: new Date().toISOString(),
    });
  }

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
      assigneeNames,
      memos,
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
  assigneeNames: string[];
  /** 새 메모 추가 (작성자 = actorName) */
  addMemo: string;
}>;

export async function updatePersonalChecklistItem(
  id: string,
  actorName: string,
  patch: UpdateChecklistInput,
): Promise<PersonalChecklistDto> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(personalChecklistItems)
    .where(eq(personalChecklistItems.id, id))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');
  if (!canAccessItem(existing, actorName)) throw new Error('NOT_FOUND');

  const isOwner = existing.ownerName === actorName;
  // 담당자는 완료·메모만, 작성자는 전체 수정
  if (!isOwner) {
    const allowedKeys = new Set(['completed', 'addMemo']);
    for (const key of Object.keys(patch)) {
      if (!allowedKeys.has(key)) {
        throw new Error('작성자만 수정할 수 있습니다.');
      }
    }
  }

  if (patch.dueDate !== undefined && !patch.dueDate.trim()) {
    throw new Error('마감기한을 지정하세요.');
  }

  const nextReflect = patch.reflectInNotes ?? existing.reflectInNotes;
  const nextClientId = patch.clientId !== undefined ? patch.clientId : existing.clientId;
  const nextTaxType = patch.taxType !== undefined
    ? patch.taxType
    : checklistTaxTypeFromRow(existing);
  const normalized = normalizeChecklistTaxType(nextTaxType);

  let nextMemos = normalizeMemos(existing.memos);
  if (patch.addMemo !== undefined) {
    const body = patch.addMemo.trim();
    if (body) {
      nextMemos = [
        ...nextMemos,
        {
          id: crypto.randomUUID(),
          authorName: actorName,
          body,
          createdAt: new Date().toISOString(),
        },
      ];
    }
  }

  const nextAssignees =
    patch.assigneeNames !== undefined
      ? normalizeAssignees(patch.assigneeNames, existing.ownerName)
      : normalizeAssignees(
          (existing.assigneeNames as string[] | null | undefined) ?? [],
          existing.ownerName,
        );

  const [row] = await db
    .update(personalChecklistItems)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.clientId !== undefined ? { clientId: patch.clientId } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate.trim() } : {}),
      ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
      ...(patch.reflectInNotes !== undefined ? { reflectInNotes: patch.reflectInNotes } : {}),
      ...(patch.assigneeNames !== undefined ? { assigneeNames: nextAssignees } : {}),
      ...(patch.addMemo !== undefined ? { memos: nextMemos } : {}),
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

export async function deletePersonalChecklistItem(id: string, actorName: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(personalChecklistItems)
    .where(eq(personalChecklistItems.id, id))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');
  if (existing.ownerName !== actorName) throw new Error('작성자만 삭제할 수 있습니다.');

  if (existing.reflectInNotes && existing.clientId) {
    const client = await getClientById(existing.clientId);
    if (client) await unsyncChecklistFromClientNotes(client, existing);
  }

  await db.delete(personalChecklistItems).where(eq(personalChecklistItems.id, id));
}

export async function getPersonalChecklistById(
  id: string,
  actorName?: string,
): Promise<PersonalChecklistDto | null> {
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
  if (actorName && !canAccessItem(row.item, actorName)) return null;
  return toDto(row.item, row.clientName?.trim() || undefined);
}
