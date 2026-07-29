import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { leaveBalances, leaveNotifications, leaveRequests, users } from '@/db/schema';
import type {
  LeaveBalanceDto,
  LeaveHalfSlot,
  LeaveKind,
  LeaveNotificationDto,
  LeaveRequestDto,
  LeaveRequestStatus,
} from '@/app/types/leave';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';
import { DATA_VIEWER_LOGIN_IDS } from '@/lib/masterAccess';
import { getManagerMatchNames, managerNamesMatch } from '@/app/utils/managerMatch';

function parseDays(raw: string | number | null | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '0').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10000) / 10000;
}

function daysToText(n: number): string {
  const v = Math.round(n * 10000) / 10000;
  return String(v);
}

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function inclusiveCalendarDays(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function computeLeaveDays(input: {
  leaveKind: LeaveKind;
  halfSlot?: LeaveHalfSlot | '';
  startDate: string;
  endDate: string;
}): number {
  if (input.leaveKind === 'half') {
    if (!input.halfSlot || (input.halfSlot !== 'am' && input.halfSlot !== 'pm')) {
      throw new Error('오전/오후 반차를 선택하세요.');
    }
    if (input.startDate !== input.endDate) {
      throw new Error('반차는 하루만 선택할 수 있습니다.');
    }
    return 0.5;
  }
  const days = inclusiveCalendarDays(input.startDate, input.endDate);
  if (days < 1) throw new Error('휴가 기간이 올바르지 않습니다.');
  return days;
}

function toRequestDto(row: typeof leaveRequests.$inferSelect): LeaveRequestDto {
  const kind = row.leaveKind === 'half' ? 'half' : 'full';
  const half =
    row.halfSlot === 'am' || row.halfSlot === 'pm' ? row.halfSlot : ('' as const);
  const status = (['pending', 'approved', 'rejected', 'cancelled'].includes(row.status)
    ? row.status
    : 'pending') as LeaveRequestStatus;
  return {
    id: row.id,
    applicantName: row.applicantName,
    title: row.title,
    body: row.body,
    leaveKind: kind,
    halfSlot: half,
    startDate: row.startDate,
    endDate: row.endDate,
    days: parseDays(row.days),
    status,
    reviewNote: row.reviewNote,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function usedDaysByMember(
  year: number,
  memberNames: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (memberNames.length === 0) return map;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const db = getDb();
  const rows = await db
    .select({
      applicantName: leaveRequests.applicantName,
      days: leaveRequests.days,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.status, 'approved'),
        inArray(leaveRequests.applicantName, memberNames),
        lte(leaveRequests.startDate, to),
        gte(leaveRequests.endDate, from),
      ),
    );
  for (const row of rows) {
    const name = row.applicantName;
    map.set(name, (map.get(name) ?? 0) + parseDays(row.days));
  }
  return map;
}

function emptyBalance(memberName: string, year: number): LeaveBalanceDto {
  return {
    id: null,
    memberName,
    year,
    hireDate: '',
    resignDate: '',
    useHireDateBasis: false,
    accrued: 0,
    carryOver: 0,
    increase: 0,
    decrease: 0,
    totalDays: 0,
    usedDays: 0,
    remainingDays: 0,
    updatedBy: '',
    updatedAt: null,
  };
}

function withTotals(
  base: Omit<LeaveBalanceDto, 'totalDays' | 'usedDays' | 'remainingDays'> & {
    usedDays: number;
  },
): LeaveBalanceDto {
  const totalDays =
    Math.round((base.accrued + base.carryOver + base.increase - base.decrease) * 10000) / 10000;
  const remainingDays = Math.round((totalDays - base.usedDays) * 10000) / 10000;
  return { ...base, totalDays, remainingDays };
}

/** 연차 잔고 목록에는 인디(신상협) 제외 */
function isHiddenFromLeaveBalance(memberName: string): boolean {
  return managerNamesMatch(memberName, '인디');
}

export async function listLeaveBalances(year: number): Promise<LeaveBalanceDto[]> {
  const db = getDb();
  const members = (await listCalendarTeamMembers()).filter(n => !isHiddenFromLeaveBalance(n));
  const rows = await db
    .select()
    .from(leaveBalances)
    .where(eq(leaveBalances.year, year));
  const byName = new Map(rows.map(r => [r.memberName, r]));
  const usedMap = await usedDaysByMember(year, members);

  return members.map(name => {
    const row = byName.get(name);
    const usedDays = usedMap.get(name) ?? 0;
    if (!row) {
      return withTotals({ ...emptyBalance(name, year), usedDays });
    }
    return withTotals({
      id: row.id,
      memberName: row.memberName,
      year: row.year,
      hireDate: row.hireDate,
      resignDate: row.resignDate,
      useHireDateBasis: row.useHireDateBasis,
      accrued: parseDays(row.accrued),
      carryOver: parseDays(row.carryOver),
      increase: parseDays(row.increase),
      decrease: parseDays(row.decrease),
      usedDays,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    });
  });
}

async function resolveLeaveApproverNames(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ name: users.name, loginId: users.loginId })
    .from(users);
  const names = new Set<string>();
  for (const r of rows) {
    const login = r.loginId.trim().toLowerCase();
    if (login === 'indie' || (DATA_VIEWER_LOGIN_IDS as readonly string[]).includes(login)) {
      const n = r.name.trim();
      if (n) names.add(n);
    }
  }
  if (names.size === 0) names.add('인디');
  return [...names];
}

async function notifyLeaveApprovers(leaveRequestId: string, actorName: string, title: string) {
  const recipients = await resolveLeaveApproverNames();
  if (recipients.length === 0) return;
  const db = getDb();
  await db.insert(leaveNotifications).values(
    recipients.map(recipientName => ({
      leaveRequestId,
      recipientName,
      actorName,
      title: title.trim() || '휴가 결재 요청',
    })),
  );
}

async function markLeaveNotificationsReadForRequest(leaveRequestId: string) {
  const db = getDb();
  await db
    .update(leaveNotifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(leaveNotifications.leaveRequestId, leaveRequestId), isNull(leaveNotifications.readAt)),
    );
}

export async function listUnreadLeaveNotifications(
  recipientName: string,
): Promise<LeaveNotificationDto[]> {
  const aliases = getManagerMatchNames(recipientName);
  if (aliases.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(leaveNotifications)
    .where(
      and(inArray(leaveNotifications.recipientName, aliases), isNull(leaveNotifications.readAt)),
    )
    .orderBy(desc(leaveNotifications.createdAt))
    .limit(50);
  return rows.map(r => ({
    id: r.id,
    leaveRequestId: r.leaveRequestId,
    recipientName: r.recipientName,
    actorName: r.actorName,
    title: r.title,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function markLeaveNotificationRead(
  id: string,
  recipientName: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(leaveNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(leaveNotifications.id, id),
        eq(leaveNotifications.recipientName, recipientName),
        isNull(leaveNotifications.readAt),
      ),
    );
}

export async function upsertLeaveBalance(
  actorName: string,
  patch: {
    memberName: string;
    year: number;
    hireDate?: string;
    resignDate?: string;
    useHireDateBasis?: boolean;
    accrued?: number;
    carryOver?: number;
    increase?: number;
    decrease?: number;
  },
): Promise<LeaveBalanceDto> {
  const db = getDb();
  const memberName = patch.memberName.trim();
  if (!memberName) throw new Error('담당자를 지정하세요.');
  const year = patch.year;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('연도가 올바르지 않습니다.');
  }

  const [existing] = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.memberName, memberName), eq(leaveBalances.year, year)))
    .limit(1);

  const values = {
    hireDate: patch.hireDate !== undefined ? patch.hireDate.trim() : (existing?.hireDate ?? ''),
    resignDate:
      patch.resignDate !== undefined ? patch.resignDate.trim() : (existing?.resignDate ?? ''),
    useHireDateBasis:
      patch.useHireDateBasis !== undefined
        ? patch.useHireDateBasis
        : (existing?.useHireDateBasis ?? false),
    accrued: daysToText(
      patch.accrued !== undefined ? patch.accrued : parseDays(existing?.accrued),
    ),
    carryOver: daysToText(
      patch.carryOver !== undefined ? patch.carryOver : parseDays(existing?.carryOver),
    ),
    increase: daysToText(
      patch.increase !== undefined ? patch.increase : parseDays(existing?.increase),
    ),
    decrease: daysToText(
      patch.decrease !== undefined ? patch.decrease : parseDays(existing?.decrease),
    ),
    updatedBy: actorName,
    updatedAt: new Date(),
  };

  let row: typeof leaveBalances.$inferSelect;
  if (existing) {
    const [updated] = await db
      .update(leaveBalances)
      .set(values)
      .where(eq(leaveBalances.id, existing.id))
      .returning();
    row = updated;
  } else {
    const [inserted] = await db
      .insert(leaveBalances)
      .values({ memberName, year, ...values })
      .returning();
    row = inserted;
  }

  const usedMap = await usedDaysByMember(year, [memberName]);
  return withTotals({
    id: row.id,
    memberName: row.memberName,
    year: row.year,
    hireDate: row.hireDate,
    resignDate: row.resignDate,
    useHireDateBasis: row.useHireDateBasis,
    accrued: parseDays(row.accrued),
    carryOver: parseDays(row.carryOver),
    increase: parseDays(row.increase),
    decrease: parseDays(row.decrease),
    usedDays: usedMap.get(memberName) ?? 0,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listLeaveRequests(opts?: {
  applicantName?: string;
  status?: LeaveRequestStatus | LeaveRequestStatus[];
  year?: number;
}): Promise<LeaveRequestDto[]> {
  const db = getDb();
  const conditions = [];
  if (opts?.applicantName) {
    conditions.push(eq(leaveRequests.applicantName, opts.applicantName));
  }
  if (opts?.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    conditions.push(inArray(leaveRequests.status, statuses));
  }
  if (opts?.year) {
    const from = `${opts.year}-01-01`;
    const to = `${opts.year}-12-31`;
    conditions.push(lte(leaveRequests.startDate, to));
    conditions.push(gte(leaveRequests.endDate, from));
  }

  const base = db.select().from(leaveRequests).orderBy(desc(leaveRequests.createdAt)).limit(300);
  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(leaveRequests)
          .where(and(...conditions))
          .orderBy(desc(leaveRequests.createdAt))
          .limit(300)
      : await base;
  return rows.map(toRequestDto);
}

export async function getLeaveRequest(id: string): Promise<LeaveRequestDto | null> {
  const db = getDb();
  const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  return row ? toRequestDto(row) : null;
}

export async function createLeaveRequest(
  applicantName: string,
  input: {
    title: string;
    body?: string;
    leaveKind: LeaveKind;
    halfSlot?: LeaveHalfSlot | '';
    startDate: string;
    endDate: string;
  },
): Promise<LeaveRequestDto> {
  const title = input.title.trim();
  if (!title) throw new Error('제목을 입력하세요.');
  if (!parseIsoDate(input.startDate) || !parseIsoDate(input.endDate)) {
    throw new Error('날짜 형식이 올바르지 않습니다.');
  }
  const days = computeLeaveDays({
    leaveKind: input.leaveKind,
    halfSlot: input.halfSlot,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const year = Number(input.startDate.slice(0, 4));
  const balances = await listLeaveBalances(year);
  const mine = balances.find(b => b.memberName === applicantName);
  // 잔고가 설정된 경우에만 잔여 부족 차단 (미설정=전부 0이면 신청 허용)
  if (mine && mine.totalDays > 0 && mine.remainingDays + 1e-9 < days) {
    throw new Error(
      `잔여 연차(${mine.remainingDays}일)보다 많은 일수(${days}일)를 신청할 수 없습니다.`,
    );
  }

  const db = getDb();
  const [row] = await db
    .insert(leaveRequests)
    .values({
      applicantName,
      title,
      body: (input.body || '').trim(),
      leaveKind: input.leaveKind,
      halfSlot: input.leaveKind === 'half' ? input.halfSlot || '' : '',
      startDate: input.startDate,
      endDate: input.endDate,
      days: daysToText(days),
      status: 'pending',
    })
    .returning();
  const dto = toRequestDto(row);
  await notifyLeaveApprovers(
    dto.id,
    applicantName,
    `${applicantName} · ${title} (${dto.startDate}~${dto.endDate}, ${dto.days}일)`,
  );
  return dto;
}

export async function cancelLeaveRequest(
  id: string,
  actorName: string,
): Promise<LeaveRequestDto> {
  const db = getDb();
  const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');
  if (existing.applicantName !== actorName) throw new Error('본인 신청만 취소할 수 있습니다.');
  if (existing.status !== 'pending') throw new Error('대기 중인 신청만 취소할 수 있습니다.');
  const [row] = await db
    .update(leaveRequests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(leaveRequests.id, id))
    .returning();
  await markLeaveNotificationsReadForRequest(id);
  return toRequestDto(row);
}

export async function reviewLeaveRequest(
  id: string,
  reviewerName: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string,
): Promise<LeaveRequestDto> {
  const db = getDb();
  const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');
  if (existing.status !== 'pending') throw new Error('이미 처리된 신청입니다.');

  if (decision === 'approved') {
    const year = Number(existing.startDate.slice(0, 4));
    const days = parseDays(existing.days);
    const balances = await listLeaveBalances(year);
    const mine = balances.find(b => b.memberName === existing.applicantName);
    if (mine && mine.totalDays > 0 && mine.remainingDays + 1e-9 < days) {
      throw new Error(
        `잔여 연차(${mine.remainingDays}일)가 부족합니다. 잔고를 확인하세요.`,
      );
    }
  }

  const [row] = await db
    .update(leaveRequests)
    .set({
      status: decision,
      reviewNote: (reviewNote || '').trim(),
      reviewedBy: reviewerName,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leaveRequests.id, id))
    .returning();
  await markLeaveNotificationsReadForRequest(id);
  return toRequestDto(row);
}

/** 캘린더용 — 승인된 휴가 (담당자 필터) */
export async function listApprovedLeaveInRange(
  ownerNames: string[],
  from: string,
  to: string,
): Promise<LeaveRequestDto[]> {
  const names = ownerNames.map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.status, 'approved'),
        inArray(leaveRequests.applicantName, names),
        lte(leaveRequests.startDate, to),
        gte(leaveRequests.endDate, from),
      ),
    )
    .orderBy(asc(leaveRequests.startDate));
  return rows.map(toRequestDto);
}
