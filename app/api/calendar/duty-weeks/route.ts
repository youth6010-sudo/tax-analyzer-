import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageDuty } from '@/lib/calendarAccess';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';
import { listDutyMonthSlots, upsertDutyMonth } from '@/lib/dutyWeeks';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const year = Number(url.searchParams.get('year') || new Date().getFullYear());
    const month = Number(url.searchParams.get('month') || new Date().getMonth() + 1);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '연·월이 올바르지 않습니다.' }, { status: 400 });
    }
    const weeks = await listDutyMonthSlots(year, month);
    const team = await listCalendarTeamMembers();
    return NextResponse.json({
      year,
      month,
      weeks,
      team,
      canManage: canManageDuty(user),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('duty-weeks GET', err);
    return NextResponse.json({ error: '당번을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageDuty(user)) {
      return NextResponse.json({ error: '당번 지정은 찰리·리아(관리자)만 가능합니다.' }, { status: 403 });
    }
    const body = (await req.json()) as {
      year?: number;
      month?: number;
      weeks?: { weekStart?: string; memberName?: string | null }[];
    };
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '연·월이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!Array.isArray(body.weeks)) {
      return NextResponse.json({ error: 'weeks가 필요합니다.' }, { status: 400 });
    }
    const weeks = body.weeks.map(w => ({
      weekStart: (w.weekStart || '').trim(),
      memberName: w.memberName == null || w.memberName === '' ? null : String(w.memberName).trim(),
    }));
    if (weeks.some(w => !w.weekStart)) {
      return NextResponse.json({ error: 'weekStart가 필요합니다.' }, { status: 400 });
    }
    const saved = await upsertDutyMonth(user.name, year, month, weeks);
    return NextResponse.json({ year, month, weeks: saved, canManage: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '저장 실패';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('duty-weeks PUT', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
