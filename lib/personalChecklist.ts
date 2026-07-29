import { and, asc, desc, eq, gte, inArray, lte, not, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, personalChecklistItems } from '@/db/schema';
import type {
  ChecklistTaxType,
  CheckoffDetail,
  ImprovementRequestDto,
  PersonalChecklistAttachment,
  PersonalChecklistDto,
  PersonalChecklistMemo,
  PersonalChecklistNotificationDto,
  ProcessedRoutedRequestDto,
  SuppliesOrderDto,
} from '@/app/types/calendar';
import {
  checklistTaxTypeFromRow,
  forcedAssigneesForTaxType,
  IMPROVEMENT_REQUEST_ASSIGNEES,
  isImprovementRequestTaxType,
  isRoutedRequestTaxType,
  isSuppliesOrderTaxType,
  normalizeChecklistTaxType,
  SUPPLIES_ORDER_ASSIGNEE,
} from '@/app/types/calendar';
import { syncChecklistToClientNotes, unsyncChecklistFromClientNotes } from '@/lib/personalChecklistSync';
import { getClientById } from '@/lib/clientsDb';
import {
  countCompletedAmongMembers,
  dismissPersonalChecklistCheckoff,
  listCheckoffDetailsForPersonalItems,
  setPersonalChecklistCheckoff,
  type PersonalChecklistCheckoffDetailMap,
} from '@/lib/personalChecklistCheckoffs';
import { createCompletionNotification, listUnreadPersonalChecklistNotifications, markItemNotificationsRead } from '@/lib/personalChecklistNotifications';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';
import { getManagerMatchNames, managerNamesMatch, resolveCanonicalMemberName } from '@/app/utils/managerMatch';

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

/** 구분별 고정 협업자 적용 */
function assigneesForTaxType(
  taxType: ChecklistTaxType,
  names: string[] | undefined | null,
  ownerName: string,
): string[] {
  let base = normalizeAssignees(names, ownerName);
  // 시스템 개선: 다야는 협업자에서 제외 (비품 담당과 혼동 방지)
  if (isImprovementRequestTaxType(taxType)) {
    base = base.filter(n => !managerNamesMatch(n, SUPPLIES_ORDER_ASSIGNEE));
  }
  const forced = forcedAssigneesForTaxType(taxType);
  if (forced.length === 0) return base;
  const out = [...base];
  for (const name of forced) {
    if (name === ownerName) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function participantsOf(ownerName: string, assigneeNames: string[]): string[] {
  return [ownerName, ...assigneeNames];
}

/** 비품·업무개선: 협업자만 완료 체크. 시스템개선은 리아·찰리 항상(요청자가 리아여도 포함) */
function checkoffParticipants(
  taxType: ChecklistTaxType,
  ownerName: string,
  assigneeNames: string[],
): string[] {
  if (isImprovementRequestTaxType(taxType)) {
    return [...IMPROVEMENT_REQUEST_ASSIGNEES];
  }
  if (isRoutedRequestTaxType(taxType)) return assigneeNames;
  return participantsOf(ownerName, assigneeNames);
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
    const attachments = Array.isArray(rec.attachments)
      ? rec.attachments
        .filter((att): att is Record<string, unknown> => !!att && typeof att === 'object')
        .map(att => ({
          id: typeof att.id === 'string' ? att.id : crypto.randomUUID(),
          name: typeof att.name === 'string' ? att.name.trim() : 'image',
          contentType: typeof att.contentType === 'string' ? att.contentType : 'image/*',
          dataUrl: typeof att.dataUrl === 'string' ? att.dataUrl : '',
        }))
        .filter(att => att.dataUrl.startsWith('data:image/'))
      : [];
    if (!id || !authorName || !body) continue;
    out.push({
      id,
      authorName,
      body,
      createdAt: createdAt || new Date().toISOString(),
      ...(attachments.length > 0 ? { attachments } : {}),
    });
  }
  return out;
}

function toBaseDto(
  row: typeof personalChecklistItems.$inferSelect,
  clientName?: string,
): PersonalChecklistDto {
  const taxType = checklistTaxTypeFromRow(row);
  const rawAssignees = (row.assigneeNames as string[] | null | undefined) ?? [];
  // 시스템 개선은 저장·표시 모두 다야 제외 + 고정 협업자 반영
  const assigneeNames = isImprovementRequestTaxType(taxType)
    ? assigneesForTaxType(taxType, rawAssignees, row.ownerName)
    : normalizeAssignees(rawAssignees, row.ownerName);
  const collaborative = assigneeNames.length > 0;
  return {
    id: row.id,
    ownerName: row.ownerName,
    clientId: row.clientId,
    clientName,
    title: row.title,
    category: row.category as PersonalChecklistDto['category'],
    taxType,
    dueDate: row.dueDate,
    completed: row.completed,
    reflectInNotes: row.reflectInNotes,
    assigneeNames,
    memos: normalizeMemos(row.memos),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    collaborative,
    participants: collaborative
      ? checkoffParticipants(taxType, row.ownerName, assigneeNames)
      : undefined,
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
      myCompletedAt: base.completed ? base.updatedAt : null,
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
      dismissedAt: legacyAllDone ? null : (d?.dismissedAt ?? null),
    };
    if (completed) done += 1;
  }

  const myAliases = viewerName ? getManagerMatchNames(viewerName) : [];
  const myCheckoff = myAliases.some(a => checkoffs[a])
    || Boolean(viewerName && checkoffs[viewerName]);
  const myDismissed = myAliases.some(a => Boolean(detailMap[a]?.dismissedAt))
    || Boolean(viewerName && detailMap[viewerName]?.dismissedAt);
  const myCompletedAt = myAliases
    .map(a => detailMap[a]?.completedAt)
    .find((v): v is string => Boolean(v))
    ?? (viewerName ? detailMap[viewerName]?.completedAt ?? null : null);

  // 작성자는 완료시각까지, 협업자도 각자 진행 현황은 개인 체크리스트에서 확인
  const canViewDetails = !!viewerName && (
    managerNamesMatch(viewerName, base.ownerName)
    || participants.some(p => managerNamesMatch(viewerName, p))
  );

  const isImprovement = isImprovementRequestTaxType(base.taxType);
  // 시스템개선: 1명 완료 = 전체 완료 (진행 표시 1/1)
  const checkoffDone = isImprovement ? (done >= 1 || legacyAllDone ? 1 : 0) : done;
  const checkoffTotal = isImprovement ? 1 : participants.length;

  return {
    ...base,
    /** 목록 표시용: 본인 완료 여부 */
    completed: myCheckoff,
    myCheckoff,
    myDismissed,
    myCompletedAt: myCompletedAt ?? null,
    checkoffDone,
    checkoffTotal,
    checkoffs,
    checkoffDetails: canViewDetails ? checkoffDetails : undefined,
  };
}

async function enrichItems(
  items: PersonalChecklistDto[],
  viewerName?: string,
  preloadedDetails?: Map<string, PersonalChecklistCheckoffDetailMap>,
): Promise<PersonalChecklistDto[]> {
  const collabIds = items.filter(i => i.collaborative).map(i => i.id);
  const detailMap = preloadedDetails
    ?? await listCheckoffDetailsForPersonalItems(collabIds);
  return items.map(item =>
    enrichDto(item, viewerName, detailMap.get(item.id)),
  );
}

function canAccessItem(
  row: Pick<typeof personalChecklistItems.$inferSelect, 'ownerName' | 'assigneeNames'>,
  userName: string,
): boolean {
  if (managerNamesMatch(row.ownerName, userName)) return true;
  const assignees = (row.assigneeNames as string[] | null | undefined) ?? [];
  return assignees.some(n => managerNamesMatch(n, userName));
}

/** 작성자이거나 협업자로 지정된 항목이 아직 열려 있는지 */
function isOpenForViewer(item: PersonalChecklistDto, viewerName: string): boolean {
  // 비품·시스템개선은 전용 목록에서만 표시
  if (isRoutedRequestTaxType(item.taxType)) return false;
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
  const aliases = getManagerMatchNames(ownerName);
  const accessConds = [
    ...aliases.map(n => eq(personalChecklistItems.ownerName, n)),
    ...aliases.map(
      n => sql`COALESCE(${personalChecklistItems.assigneeNames}, '[]'::jsonb) ? ${n}`,
    ),
  ];
  const access = accessConds.length === 1 ? accessConds[0]! : or(...accessConds)!;

  // 비품·시스템개선은 홈 전용 목록에서 조회 — 여기서 빼서 enrich 비용 절감
  const notRouted = not(inArray(personalChecklistItems.taxType, ['supplies', 'improvement']));

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
        ? and(access, notRouted)
        : and(
            access,
            notRouted,
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
    )
    .limit(opts?.includeCompleted ? 150 : 80);

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
      sql`${personalChecklistItems.taxType} NOT IN ('supplies', 'improvement')`,
      gte(personalChecklistItems.dueDate, from),
      lte(personalChecklistItems.dueDate, to),
    ))
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .orderBy(asc(personalChecklistItems.dueDate));

  const base = rows.map(r => toBaseDto(r.item, r.clientName?.trim() || undefined));
  return enrichItems(base);
}

/** 비품주문요청 목록 (캘린더 탭용) */
export async function listSuppliesOrders(
  viewerName?: string,
): Promise<SuppliesOrderDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .where(eq(personalChecklistItems.taxType, 'supplies'))
    .orderBy(desc(personalChecklistItems.createdAt))
    .limit(200);

  const base = rows.map(r => toBaseDto(r.item, r.clientName?.trim() || undefined));
  const ids = base.map(i => i.id);
  const detailMap = await listCheckoffDetailsForPersonalItems(ids);
  const enriched = await enrichItems(base, viewerName, detailMap);

  return enriched.map(item => {
    const details = detailMap.get(item.id) ?? {};
    const daya = details[SUPPLIES_ORDER_ASSIGNEE]
      ?? Object.entries(details).find(([n]) => managerNamesMatch(n, SUPPLIES_ORDER_ASSIGNEE))?.[1];
    let orderedAt =
      daya?.completed && daya.completedAt
        ? daya.completedAt
        : null;
    if (
      !orderedAt
      && managerNamesMatch(item.ownerName, SUPPLIES_ORDER_ASSIGNEE)
      && (item.myCheckoff ?? item.completed)
    ) {
      orderedAt = item.updatedAt;
    }
    return {
      ...item,
      requestedAt: item.createdAt,
      orderedAt,
    };
  });
}

/** 업무개선요청 목록 (캘린더 탭용) */
export async function listImprovementRequests(
  viewerName?: string,
): Promise<ImprovementRequestDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .where(eq(personalChecklistItems.taxType, 'improvement'))
    .orderBy(desc(personalChecklistItems.createdAt))
    .limit(200);

  const base = rows.map(r => toBaseDto(r.item, r.clientName?.trim() || undefined));
  const ids = base.map(i => i.id);
  const detailMap = await listCheckoffDetailsForPersonalItems(ids);
  const enriched = await enrichItems(base, viewerName, detailMap);

  return enriched.map(item => {
    const handlers = [...IMPROVEMENT_REQUEST_ASSIGNEES];
    const details = detailMap.get(item.id) ?? {};
    const processedBy: string[] = [];
    let latest: string | null = null;
    for (const name of handlers) {
      const d = details[name]
        ?? Object.entries(details).find(([n]) => managerNamesMatch(n, name))?.[1];
      if (d?.completed) {
        processedBy.push(name);
        if (d.completedAt && (!latest || d.completedAt > latest)) {
          latest = d.completedAt;
        }
      }
    }
    // 1명만 완료해도 처리일 표시 (리아·찰리 OR)
    const allDone = processedBy.length >= 1 || Boolean(item.completed);
    return {
      ...item,
      requestedAt: item.createdAt,
      processedAt: allDone ? (latest || item.updatedAt) : null,
      handlerNames: handlers,
      processedBy,
      checkoffDone: allDone ? 1 : 0,
      checkoffTotal: 1,
    };
  });
}

/** 홈 「비품주문/시스템개선」— 미완료 + 본인 미확인 완료 알림 */
export async function listRoutedRequestsForHome(
  viewerName: string,
): Promise<{
  open: PersonalChecklistDto[];
  /** 미확인 완료 알림 (완료자 제외 전원) */
  sharedCompleted: ProcessedRoutedRequestDto[];
  notifications: PersonalChecklistNotificationDto[];
}> {
  const db = getDb();
  const viewerAliases = getManagerMatchNames(viewerName);
  const assigneeConds = viewerAliases.map(
    n => sql`COALESCE(${personalChecklistItems.assigneeNames}, '[]'::jsonb) ? ${n}`,
  );
  const assigneeAccess = assigneeConds.length === 1
    ? assigneeConds[0]!
    : or(...assigneeConds)!;
  const ownerConds = viewerAliases.map(n => eq(personalChecklistItems.ownerName, n));
  const openAccess = or(
    ...(ownerConds.length === 1 ? [ownerConds[0]!] : ownerConds),
    assigneeAccess,
  )!;

  const [incompleteRows, completedHandlerRows, unread] = await Promise.all([
    db
      .select({
        item: personalChecklistItems,
        clientName: clients.companyName,
      })
      .from(personalChecklistItems)
      .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
      .where(and(
        inArray(personalChecklistItems.taxType, ['supplies', 'improvement']),
        openAccess,
        eq(personalChecklistItems.completed, false),
      ))
      .orderBy(desc(personalChecklistItems.createdAt))
      .limit(80),
    db
      .select({
        item: personalChecklistItems,
        clientName: clients.companyName,
      })
      .from(personalChecklistItems)
      .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
      .where(and(
        inArray(personalChecklistItems.taxType, ['supplies', 'improvement']),
        assigneeAccess,
        eq(personalChecklistItems.completed, true),
      ))
      .orderBy(desc(personalChecklistItems.updatedAt))
      .limit(40),
    listUnreadPersonalChecklistNotifications(viewerName, 80),
  ]);

  const unreadItemIds = [...new Set(unread.map(n => n.itemId))];

  const byId = new Map<string, { item: typeof personalChecklistItems.$inferSelect; clientName?: string }>();
  for (const r of [...incompleteRows, ...completedHandlerRows]) {
    if (!byId.has(r.item.id)) {
      byId.set(r.item.id, {
        item: r.item,
        clientName: r.clientName?.trim() || undefined,
      });
    }
  }

  // 미확인 알림 항목 — 요청자·다른 담당자 등 (완료자 제외하고 받은 알림)
  if (unreadItemIds.length > 0) {
    const missing = unreadItemIds.filter(id => !byId.has(id));
    if (missing.length > 0) {
      const notifRows = await db
        .select({
          item: personalChecklistItems,
          clientName: clients.companyName,
        })
        .from(personalChecklistItems)
        .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
        .where(inArray(personalChecklistItems.id, missing));
      for (const r of notifRows) {
        byId.set(r.item.id, {
          item: r.item,
          clientName: r.clientName?.trim() || undefined,
        });
      }
    }
  }

  const openBase = [...byId.values()].map(r => toBaseDto(r.item, r.clientName));
  const detailMap = await listCheckoffDetailsForPersonalItems(openBase.map(i => i.id));
  const openEnriched = await enrichItems(openBase, viewerName, detailMap);
  const unreadSet = new Set(unreadItemIds);

  const open = openEnriched
    .filter(item => {
      // 미확인 완료 알림이 있으면 목록에 표시 (완료자 외 전원)
      if (unreadSet.has(item.id)) return true;

      const handlers = item.participants?.length
        ? item.participants
        : item.assigneeNames;
      const isHandler = handlers.some(h => managerNamesMatch(h, viewerName));
      if (isHandler) {
        if (item.myDismissed) return false;
        // 시스템개선 등: 다른 사람이 이미 완료한 경우 → 알림으로만 표시(위에서 처리)
        const itemDone =
          (item.checkoffDone ?? 0) >= (item.checkoffTotal ?? 1) || Boolean(item.completed && item.checkoffTotal === 1);
        if (!item.myCheckoff && itemDone) return false;
        return true;
      }
      if (managerNamesMatch(item.ownerName, viewerName)) {
        return (item.checkoffDone ?? 0) < (item.checkoffTotal ?? 1);
      }
      return false;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const sharedCompleted: ProcessedRoutedRequestDto[] = open
    .filter(item => unreadSet.has(item.id))
    .map(item => {
      const notifs = unread.filter(n => n.itemId === item.id);
      const processedBy = [...new Set(notifs.map(n => n.actorName))];
      const details = detailMap.get(item.id) ?? {};
      let latest: string | null = null;
      for (const name of processedBy) {
        const at = details[name]?.completedAt
          ?? Object.entries(details).find(([n]) => managerNamesMatch(n, name))?.[1]?.completedAt;
        if (at && (!latest || at > latest)) latest = at;
      }
      return {
        ...item,
        requestedAt: item.createdAt,
        processedAt: latest || item.updatedAt,
        processedBy,
      };
    });

  return { open, sharedCompleted, notifications: unread };
}

/** 홈 TODO 하단 — 완료된 비품·업무개선요청 (전원 공유) */
export async function listCompletedRoutedRequests(
  limit = 40,
): Promise<ProcessedRoutedRequestDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      item: personalChecklistItems,
      clientName: clients.companyName,
    })
    .from(personalChecklistItems)
    .leftJoin(clients, eq(clients.id, personalChecklistItems.clientId))
    .where(and(
      inArray(personalChecklistItems.taxType, ['supplies', 'improvement']),
      eq(personalChecklistItems.completed, true),
    ))
    .orderBy(desc(personalChecklistItems.updatedAt))
    .limit(limit);

  const base = rows.map(r => toBaseDto(r.item, r.clientName?.trim() || undefined));
  const detailMap = await listCheckoffDetailsForPersonalItems(base.map(i => i.id));

  return base.map(item => {
    const details = detailMap.get(item.id) ?? {};
    const handlers = item.assigneeNames.length > 0
      ? item.assigneeNames
      : [...forcedAssigneesForTaxType(item.taxType)];
    const processedBy: string[] = [];
    let latest: string | null = null;
    for (const name of handlers) {
      const d = details[name];
      if (d?.completed) {
        processedBy.push(name);
        if (d.completedAt && (!latest || d.completedAt > latest)) {
          latest = d.completedAt;
        }
      }
    }
    // 전원에게 처리자·시각 공개
    const checkoffs: Record<string, boolean> = {};
    const checkoffDetails: Record<string, CheckoffDetail> = {};
    for (const name of handlers) {
      const d = details[name];
      checkoffs[name] = d?.completed ?? false;
      checkoffDetails[name] = {
        completed: d?.completed ?? false,
        completedAt: d?.completedAt ?? null,
      };
    }
    return {
      ...item,
      completed: true,
      myCheckoff: true,
      checkoffDone: processedBy.length,
      checkoffTotal: handlers.length || undefined,
      checkoffs,
      checkoffDetails,
      requestedAt: item.createdAt,
      processedAt: latest || item.updatedAt,
      processedBy,
    };
  });
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
  memo?: string | { body: string; attachments?: PersonalChecklistAttachment[] };
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

  const isRouted = isRoutedRequestTaxType(input.taxType);
  let uniqueDates = [...new Set(dueDates.map(d => d.trim()).filter(Boolean))].sort();
  if (uniqueDates.length === 0) {
    if (isRouted) uniqueDates = [''];
    else throw new Error('마감기한을 지정하세요.');
  }

  const normalized = normalizeChecklistTaxType(input.taxType);
  const assigneeNames = assigneesForTaxType(input.taxType, input.assigneeNames, ownerName);
  const memos: PersonalChecklistMemo[] = [];
  const memoBody = typeof input.memo === 'string' ? input.memo.trim() : input.memo?.body?.trim();
  const memoAttachments = typeof input.memo === 'object' && input.memo && Array.isArray(input.memo.attachments)
    ? input.memo.attachments.filter(att => att?.dataUrl?.startsWith('data:image/'))
    : [];
  if (memoBody) {
    memos.push({
      id: crypto.randomUUID(),
      authorName: ownerName,
      body: memoBody,
      createdAt: new Date().toISOString(),
      ...(memoAttachments.length > 0 ? { attachments: memoAttachments } : {}),
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
  addMemo: string | { body: string; attachments?: PersonalChecklistAttachment[] };
  /** 본인(또는 요청자) 메모 수정 */
  updateMemo: { id: string; body: string };
  /** 본인(또는 요청자) 메모 삭제 */
  deleteMemo: string;
  /** 비품·시스템개선 — 본인 목록에서만 숨김 */
  dismiss: boolean;
}>;

function patchKeysOnly(
  patch: UpdateChecklistInput,
  allowed: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(patch).filter(
    key => patch[key as keyof UpdateChecklistInput] !== undefined,
  );
  return keys.length > 0 && keys.every(key => allowed.has(key));
}

function canMutateMemo(
  memo: PersonalChecklistMemo,
  actorName: string,
  itemOwnerName: string,
): boolean {
  return (
    managerNamesMatch(memo.authorName, actorName)
    || managerNamesMatch(itemOwnerName, actorName)
  );
}

async function applyMemoPatches(
  existingMemos: unknown,
  actorName: string,
  itemOwnerName: string,
  patch: Pick<UpdateChecklistInput, 'addMemo' | 'updateMemo' | 'deleteMemo'>,
): Promise<PersonalChecklistMemo[]> {
  let next = normalizeMemos(existingMemos);

  const normalizeAddMemo = (
    value: UpdateChecklistInput['addMemo'],
  ): { body: string; attachments: PersonalChecklistAttachment[] } | null => {
    if (typeof value === 'string') {
      const body = value.trim();
      return body ? { body, attachments: [] } : null;
    }
    if (!value || typeof value !== 'object') return null;
    const body = typeof value.body === 'string' ? value.body.trim() : '';
    if (!body) return null;
    const attachments = Array.isArray(value.attachments)
      ? value.attachments.filter(att => att?.dataUrl?.startsWith('data:image/'))
      : [];
    return { body, attachments };
  };

  if (patch.deleteMemo !== undefined) {
    const memoId = patch.deleteMemo.trim();
    const target = next.find(m => m.id === memoId);
    if (!target) throw new Error('메모를 찾을 수 없습니다.');
    if (!canMutateMemo(target, actorName, itemOwnerName)) {
      throw new Error('본인이 작성한 메모만 삭제할 수 있습니다.');
    }
    next = next.filter(m => m.id !== memoId);
  }

  if (patch.updateMemo !== undefined) {
    const memoId = patch.updateMemo.id.trim();
    const body = patch.updateMemo.body.trim();
    if (!body) throw new Error('메모 내용을 입력하세요.');
    const idx = next.findIndex(m => m.id === memoId);
    if (idx < 0) throw new Error('메모를 찾을 수 없습니다.');
    const target = next[idx]!;
    if (!canMutateMemo(target, actorName, itemOwnerName)) {
      throw new Error('본인이 작성한 메모만 수정할 수 있습니다.');
    }
    next = next.map((m, i) => (i === idx ? { ...m, body } : m));
  }

  if (patch.addMemo !== undefined) {
    const nextMemo = normalizeAddMemo(patch.addMemo);
    if (nextMemo) {
      const members = await listCalendarTeamMembers();
      next = [
        ...next,
        {
          id: crypto.randomUUID(),
          authorName: resolveCanonicalMemberName(actorName, members),
          body: nextMemo.body,
          createdAt: new Date().toISOString(),
          ...(nextMemo.attachments.length > 0 ? { attachments: nextMemo.attachments } : {}),
        },
      ];
    }
  }

  return next;
}

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

  const isDismissOnly =
    patch.dismiss === true &&
    Object.keys(patch).every(key => {
      if (key === 'dismiss') return true;
      return patch[key as keyof UpdateChecklistInput] === undefined;
    });

  // 완료 알림은 팀 전원에게 감 — 수신자는 항목 담당이 아니어도 「확인」으로 알림만 닫을 수 있음
  if (isDismissOnly) {
    const taxType = checklistTaxTypeFromRow(existing);
    if (!isRoutedRequestTaxType(taxType)) {
      throw new Error('비품·시스템개선 요청만 확인할 수 있습니다.');
    }
    const hasItemAccess = canAccessItem(existing, actorName);
    const assignees = normalizeAssignees(
      (existing.assigneeNames as string[] | null | undefined) ?? [],
      existing.ownerName,
    );
    const handlers = checkoffParticipants(taxType, existing.ownerName, assignees);

    if (hasItemAccess && handlers.some(h => managerNamesMatch(h, actorName))) {
      try {
        await dismissPersonalChecklistCheckoff(id, actorName, handlers);
      } catch {
        /* 미완료 담당자는 알림만 닫기 */
      }
    }

    const marked = await markItemNotificationsRead(actorName, id);
    if (!hasItemAccess && marked === 0) {
      throw new Error('NOT_FOUND');
    }

    const item = await getPersonalChecklistById(id, hasItemAccess ? actorName : undefined);
    if (item) return item;
    return toBaseDto(
      existing,
      existing.clientId
        ? (await getClientById(existing.clientId))?.companyName
        : undefined,
    );
  }

  const isMemoOnly = patchKeysOnly(
    patch,
    new Set(['addMemo', 'updateMemo', 'deleteMemo']),
  );

  // 비품·시스템개선: 팀원 누구나 메모 추가·본인 메모 수정/삭제 가능
  if (!canAccessItem(existing, actorName)) {
    if (!isMemoOnly) throw new Error('NOT_FOUND');
    const taxType = checklistTaxTypeFromRow(existing);
    if (!isRoutedRequestTaxType(taxType)) throw new Error('NOT_FOUND');
    const members = await listCalendarTeamMembers();
    if (!members.some(m => managerNamesMatch(m, actorName))) {
      throw new Error('NOT_FOUND');
    }
    const nextMemos = await applyMemoPatches(
      existing.memos,
      actorName,
      existing.ownerName,
      patch,
    );
    const [row] = await db
      .update(personalChecklistItems)
      .set({ memos: nextMemos, updatedAt: new Date() })
      .where(eq(personalChecklistItems.id, id))
      .returning();
    let clientName: string | undefined;
    if (row.clientId) {
      const client = await getClientById(row.clientId);
      clientName = client?.companyName;
    }
    const [enriched] = await enrichItems([toBaseDto(row, clientName)], actorName);
    return enriched;
  }

  const isOwner = managerNamesMatch(existing.ownerName, actorName);
  // 협업자는 완료·메모·확인만, 작성자는 전체 수정
  if (!isOwner) {
    const allowedKeys = new Set(['completed', 'addMemo', 'updateMemo', 'deleteMemo', 'dismiss']);
    for (const key of Object.keys(patch)) {
      if (patch[key as keyof UpdateChecklistInput] === undefined) continue;
      if (!allowedKeys.has(key)) {
        throw new Error('작성자만 수정할 수 있습니다.');
      }
    }
  }

  if (patch.dismiss) {
    const taxType = checklistTaxTypeFromRow(existing);
    if (!isRoutedRequestTaxType(taxType)) {
      throw new Error('비품·시스템개선 요청만 확인할 수 있습니다.');
    }
    const assignees = normalizeAssignees(
      (existing.assigneeNames as string[] | null | undefined) ?? [],
      existing.ownerName,
    );
    const handlers = checkoffParticipants(taxType, existing.ownerName, assignees);
    // 처리 담당자: 본인 checkoff 확인(숨김). 요청자·그 외: 알림만 읽음 처리
    if (handlers.some(h => managerNamesMatch(h, actorName))) {
      try {
        await dismissPersonalChecklistCheckoff(id, actorName, handlers);
      } catch {
        /* 미완료 상태면 알림만 닫기 */
      }
    }
    await markItemNotificationsRead(actorName, id);
    const item = await getPersonalChecklistById(id, actorName);
    if (!item) throw new Error('NOT_FOUND');
    return item;
  }

  const nextTaxType = patch.taxType !== undefined
    ? patch.taxType
    : checklistTaxTypeFromRow(existing);
  const isRouted = isRoutedRequestTaxType(nextTaxType);

  if (patch.dueDate !== undefined && !patch.dueDate.trim() && !isRouted) {
    throw new Error('마감기한을 지정하세요.');
  }

  const nextReflect = patch.reflectInNotes ?? existing.reflectInNotes;
  const nextClientId = patch.clientId !== undefined ? patch.clientId : existing.clientId;
  const normalized = normalizeChecklistTaxType(nextTaxType);

  const memoTouched =
    patch.addMemo !== undefined
    || patch.updateMemo !== undefined
    || patch.deleteMemo !== undefined;
  const nextMemos = memoTouched
    ? await applyMemoPatches(existing.memos, actorName, existing.ownerName, patch)
    : normalizeMemos(existing.memos);

  const existingAssignees = normalizeAssignees(
    (existing.assigneeNames as string[] | null | undefined) ?? [],
    existing.ownerName,
  );
  const nextAssignees = assigneesForTaxType(
    nextTaxType,
    patch.assigneeNames !== undefined ? patch.assigneeNames : existingAssignees,
    existing.ownerName,
  );

  // 협업 여부는 저장 후 협업자 기준 (전부 제거 시 단독으로 전환)
  const collaborative = nextAssignees.length > 0;

  // 협업: 완료는 본인 checkoff. 항목 completed는 전원 완료 시 true.
  let patchCompleted = patch.completed;
  if (collaborative && patch.completed !== undefined) {
    const participants = checkoffParticipants(nextTaxType, existing.ownerName, nextAssignees);
    if (!participants.some(p => managerNamesMatch(p, actorName))) {
      throw new Error('협업자만 완료 처리할 수 있습니다.');
    }

    const canonicalActor = resolveCanonicalMemberName(actorName, participants);
    await setPersonalChecklistCheckoff(id, canonicalActor, patch.completed, participants);

    const doneCount = await countCompletedAmongMembers(id, participants);
    // 시스템개선: 리아·찰리 중 1명만 완료해도 항목 완료
    patchCompleted = isImprovementRequestTaxType(nextTaxType)
      ? doneCount >= 1
      : doneCount >= participants.length;

    if (patch.completed) {
      if (isSuppliesOrderTaxType(nextTaxType)) {
        // 비품주문: 완료 알림은 요청자에게만
        if (!managerNamesMatch(actorName, existing.ownerName)) {
          await createCompletionNotification({
            itemId: id,
            recipientName: existing.ownerName,
            actorName: canonicalActor,
            title: existing.title,
          });
        }
      } else if (isImprovementRequestTaxType(nextTaxType)) {
        // 시스템개선: 완료한 사람 제외하고 전원에게 알림
        const members = await listCalendarTeamMembers();
        for (const member of members) {
          if (managerNamesMatch(member, actorName)) continue;
          await createCompletionNotification({
            itemId: id,
            recipientName: member,
            actorName: canonicalActor,
            title: existing.title,
          });
        }
      } else if (!managerNamesMatch(actorName, existing.ownerName)) {
        await createCompletionNotification({
          itemId: id,
          recipientName: existing.ownerName,
          actorName: canonicalActor,
          title: existing.title,
        });
      }
    }
  }

  const [row] = await db
    .update(personalChecklistItems)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.clientId !== undefined ? { clientId: patch.clientId } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate.trim() } : {}),
      ...(patchCompleted !== undefined ? { completed: patchCompleted } : {}),
      ...(patch.reflectInNotes !== undefined ? { reflectInNotes: patch.reflectInNotes } : {}),
      ...(patch.assigneeNames !== undefined || isRouted
        ? { assigneeNames: nextAssignees }
        : {}),
      ...(memoTouched ? { memos: nextMemos } : {}),
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
