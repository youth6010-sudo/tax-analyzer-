import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, personalChecklistItems } from '@/db/schema';
import type {
  ChecklistTaxType,
  CheckoffDetail,
  PersonalChecklistDto,
  PersonalChecklistMemo,
} from '@/app/types/calendar';
import { checklistTaxTypeFromRow, normalizeChecklistTaxType } from '@/app/types/calendar';
import { syncChecklistToClientNotes, unsyncChecklistFromClientNotes } from '@/lib/personalChecklistSync';
import { getClientById } from '@/lib/clientsDb';
import {
  countCompletedAmongMembers,
  listCheckoffDetailsForPersonalItems,
  setPersonalChecklistCheckoff,
  type PersonalChecklistCheckoffDetailMap,
} from '@/lib/personalChecklistCheckoffs';
import { createCompletionNotification } from '@/lib/personalChecklistNotifications';

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

function participantsOf(ownerName: string, assigneeNames: string[]): string[] {
  return [ownerName, ...assigneeNames];
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

function toBaseDto(
  row: typeof personalChecklistItems.$inferSelect,
  clientName?: string,
): PersonalChecklistDto {
  const assigneeNames = normalizeAssignees(
    (row.assigneeNames as string[] | null | undefined) ?? [],
    row.ownerName,
  );
  const collaborative = assigneeNames.length > 0;
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
    assigneeNames,
    memos: normalizeMemos(row.memos),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    collaborative,
    participants: collaborative ? participantsOf(row.ownerName, assigneeNames) : undefined,
  };
}

function enrichDto(
  base: PersonalChecklistDto,
  viewerName: string | undefined,
  details: PersonalChecklistCheckoffDetailMap | undefined,
): PersonalChecklistDto {
  if (!base.collaborative || !base.participants) {
    return {
      ...base,
      myCheckoff: base.completed,
    };
  }

  const participants = base.participants;
  const detailMap = details ?? {};
  const hasAnyRows = Object.keys(detailMap).length > 0;
  // 레거시: checkoff 없이 completed만 있는 공동 업무
  const legacyAllDone = !hasAnyRows && base.completed;

  const checkoffs: Record<string, boolean> = {};
  const checkoffDetails: Record<string, CheckoffDetail> = {};
  let done = 0;
  for (const name of participants) {
    const d = detailMap[name];
    const completed = legacyAllDone ? true : (d?.completed ?? false);
    checkoffs[name] = completed;
    checkoffDetails[name] = {
      completed,
      completedAt: legacyAllDone ? null : (d?.completedAt ?? null),
    };
    if (completed) done += 1;
  }

  const myCheckoff = viewerName
    ? (checkoffs[viewerName] ?? false)
    : false;

  // 작성자는 완료시각까지, 협업자도 각자 진행 현황은 개인 체크리스트에서 확인
  const canViewDetails = !!viewerName && (
    viewerName === base.ownerName
    || participants.includes(viewerName)
  );

  return {
    ...base,
    /** 목록 표시용: 본인 완료 여부 */
    completed: myCheckoff,
    myCheckoff,
    checkoffDone: done,
    checkoffTotal: participants.length,
    checkoffs,
    checkoffDetails: canViewDetails ? checkoffDetails : undefined,
  };
}

async function enrichItems(
  items: PersonalChecklistDto[],
  viewerName?: string,
): Promise<PersonalChecklistDto[]> {
  const collabIds = items.filter(i => i.collaborative).map(i => i.id);
  const detailMap = await listCheckoffDetailsForPersonalItems(collabIds);
  return items.map(item =>
    enrichDto(item, viewerName, detailMap.get(item.id)),
  );
}

function canAccessItem(
  row: Pick<typeof personalChecklistItems.$inferSelect, 'ownerName' | 'assigneeNames'>,
  userName: string,
): boolean {
  if (row.ownerName === userName) return true;
  const assignees = (row.assigneeNames as string[] | null | undefined) ?? [];
  return assignees.some(n => n.trim() === userName);
}

/** 작성자이거나 협업자로 지정된 항목이 아직 열려 있는지 */
function isOpenForViewer(item: PersonalChecklistDto, viewerName: string): boolean {
  if (!item.collaborative) return !(item.myCheckoff ?? item.completed);
  // 작성자: 전원 완료 전까지 개인 체크리스트에 유지 (누가 완료했는지 확인)
  if (item.ownerName === viewerName) {
    return (item.checkoffDone ?? 0) < (item.checkoffTotal ?? 0);
  }
  // 협업자: 본인 완료 여부로 표시
  return !(item.myCheckoff ?? item.completed);
}

/** 내가 작성했거나 협업자로 지정된 항목 */
export async function listPersonalChecklistForOwner(
  ownerName: string,
  opts?: { includeCompleted?: boolean },
): Promise<PersonalChecklistDto[]> {
  const db = getDb();
  // jsonb 배열 원소 매칭 (? 연산) — 협업자에게도 동일하게 노출
  const access = or(
    eq(personalChecklistItems.ownerName, ownerName),
    sql`COALESCE(${personalChecklistItems.assigneeNames}, '[]'::jsonb) ? ${ownerName}`,
  );

  // 완료 포함: 전부. 미완료만: 단독(completed=false) + 협업(아래에서 뷰어 기준 필터)
  const rows = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .where(
      opts?.includeCompleted
        ? access
        : and(
            access,
            or(
              sql`jsonb_array_length(COALESCE(${personalChecklistItems.assigneeNames}, '[]'::jsonb)) > 0`,
              eq(personalChecklistItems.completed, false),
            ),
          ),
    )
    .orderBy(
      // 마감 임박순 · 마감 없음은 뒤
      sql`CASE WHEN ${personalChecklistItems.dueDate} = '' THEN 1 ELSE 0 END`,
      asc(personalChecklistItems.dueDate),
      asc(personalChecklistItems.sortOrder),
      desc(personalChecklistItems.createdAt),
    );

  const base = rows.map(r => toBaseDto(r.item, r.clientName?.trim() || undefined));
  const enriched = await enrichItems(base, ownerName);

  if (opts?.includeCompleted) return enriched;
  return enriched.filter(item => isOpenForViewer(item, ownerName));
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

  const base = rows.map(r => toBaseDto(r.item, r.clientName?.trim() || undefined));
  return enrichItems(base);
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

  const base = rows.map(r => toBaseDto(r.item, r.clientName?.trim() || undefined));
  return enrichItems(base);
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
  const [item] = await createPersonalChecklistItems(ownerName, input, [
    input.dueDate?.trim() || '',
  ]);
  return item;
}

/** 동일 내용으로 여러 마감일 일괄 등록 */
export async function createPersonalChecklistItems(
  ownerName: string,
  input: CreateChecklistInput,
  dueDates: string[],
): Promise<PersonalChecklistDto[]> {
  const db = getDb();
  const title = input.title.trim();
  if (!title) throw new Error('제목을 입력하세요.');

  const uniqueDates = [...new Set(dueDates.map(d => d.trim()).filter(Boolean))].sort();
  if (uniqueDates.length === 0) throw new Error('마감기한을 지정하세요.');

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

  const rows = await db
    .insert(personalChecklistItems)
    .values(
      uniqueDates.map(dueDate => ({
        ownerName,
        title,
        category: normalized.category,
        taxType: normalized.taxType,
        clientId: input.clientId || null,
        dueDate,
        reflectInNotes: Boolean(input.reflectInNotes),
        assigneeNames,
        memos,
      })),
    )
    .returning();

  if (input.reflectInNotes && input.clientId) {
    const client = await getClientById(input.clientId);
    if (client) {
      for (const row of rows) {
        await syncChecklistToClientNotes(client, row);
      }
    }
  }

  let clientName: string | undefined;
  if (input.clientId) {
    const client = await getClientById(input.clientId);
    clientName = client?.companyName;
  }

  const base = rows.map(row => toBaseDto(row, clientName));
  return enrichItems(base, ownerName);
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
  // 협업자는 완료·메모만, 작성자는 전체 수정
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

  const existingAssignees = normalizeAssignees(
    (existing.assigneeNames as string[] | null | undefined) ?? [],
    existing.ownerName,
  );
  const nextAssignees =
    patch.assigneeNames !== undefined
      ? normalizeAssignees(patch.assigneeNames, existing.ownerName)
      : existingAssignees;

  // 협업 여부는 저장 후 협업자 기준 (전부 제거 시 단독으로 전환)
  const collaborative = nextAssignees.length > 0;

  // 협업: 완료는 본인 checkoff. 항목 completed는 전원 완료 시 true.
  let patchCompleted = patch.completed;
  if (collaborative && patch.completed !== undefined) {
    const participants = participantsOf(existing.ownerName, nextAssignees);
    if (!participants.includes(actorName)) {
      throw new Error('협업자만 완료 처리할 수 있습니다.');
    }

    await setPersonalChecklistCheckoff(id, actorName, patch.completed);

    // 체크 해제는 setPersonalChecklistCheckoff 안에서 알림 삭제
    if (patch.completed && actorName !== existing.ownerName) {
      await createCompletionNotification({
        itemId: id,
        recipientName: existing.ownerName,
        actorName,
        title: existing.title,
      });
    }

    const doneCount = await countCompletedAmongMembers(id, participants);
    patchCompleted = doneCount >= participants.length;
  }

  const [row] = await db
    .update(personalChecklistItems)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.clientId !== undefined ? { clientId: patch.clientId } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate.trim() } : {}),
      ...(patchCompleted !== undefined ? { completed: patchCompleted } : {}),
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

  const [enriched] = await enrichItems([toBaseDto(row, clientName)], actorName);
  return enriched;
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
  const [enriched] = await enrichItems(
    [toBaseDto(row.item, row.clientName?.trim() || undefined)],
    actorName,
  );
  return enriched;
}
