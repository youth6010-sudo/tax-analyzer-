import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  canApplyLeave,
  canViewAllLeaveRequests,
  canViewLeavePendingQueue,
} from '@/lib/leaveAccess';
import {
  createLeaveRequest,
  listLeaveRequests,
  listMyInFlightLeaveRequests,
  listMySubstituteDutiesOnDate,
  listPendingLeaveForApprover,
} from '@/lib/leaveDb';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';
import type { LeaveKind, LeaveHalfSlot } from '@/app/types/leave';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const mine = url.searchParams.get('mine') === '1';
    const all = url.searchParams.get('all') === '1';
    const pending = url.searchParams.get('pending') === '1';
    const applicant = (url.searchParams.get('applicant') || '').trim();
    const yearParam = url.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : undefined;
    const canApprove = canViewLeavePendingQueue(user);
    const canViewAll = canViewAllLeaveRequests(user);

    if (pending) {
      if (!canApprove) {
        return NextResponse.json({ error: '결재 목록 권한이 없습니다.' }, { status: 403 });
      }
      const items = await listPendingLeaveForApprover(user, year);
      return NextResponse.json({ items, canApprove: true, canViewAll });
    }

    /** 오늘 내가 업무대체자인 승인 휴가 — 홈 To Do「휴가 결재」 */
    if (url.searchParams.get('substituteToday') === '1') {
      const items = await listMySubstituteDutiesOnDate(user.name);
      return NextResponse.json({ items, canApprove, canViewAll });
    }

    /** 내가 올린 신청중·취소신청중 — 홈 To Do「신청중」표시용 */
    if (url.searchParams.get('inflight') === '1') {
      const items = await listMyInFlightLeaveRequests(user.name, year);
      return NextResponse.json({ items, canApprove, canViewAll });
    }

    // 인디: 전체 현황 (담당자 필터 선택 가능)
    if (all || (mine && canViewAll)) {
      if (!canViewAll) {
        return NextResponse.json({ error: '전체 현황 권한이 없습니다.' }, { status: 403 });
      }
      const items = await listLeaveRequests({
        applicantName: applicant || undefined,
        year,
      });
      const members = await listCalendarTeamMembers();
      return NextResponse.json({
        items,
        canApprove,
        canViewAll: true,
        members,
      });
    }

    const items = await listLeaveRequests({
      applicantName: mine ? user.name : undefined,
      year,
    });
    return NextResponse.json({
      items: mine
        ? items
        : canApprove
          ? items
          : items.filter(i => i.applicantName === user.name),
      canApprove,
      canViewAll,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    if (msg === 'UNAUTHORIZED' || msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[leave/requests GET]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canApplyLeave(user)) {
      return NextResponse.json(
        { error: '인디(결재권자)는 연차 신청 대상이 아닙니다.' },
        { status: 403 },
      );
    }
    const body = (await req.json()) as {
      title?: string;
      body?: string;
      leaveKind?: LeaveKind;
      halfSlot?: LeaveHalfSlot | '';
      startDate?: string;
      endDate?: string;
      substituteName?: string;
    };
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: '기간을 입력하세요.' }, { status: 400 });
    }
    const leaveKind: LeaveKind = body.leaveKind === 'half' ? 'half' : 'full';
    const item = await createLeaveRequest(user.name, {
      title: body.title || (leaveKind === 'half' ? '반차 승인 요청' : '연차 승인 요청'),
      body: body.body,
      leaveKind,
      halfSlot: body.halfSlot,
      startDate: body.startDate,
      endDate: leaveKind === 'half' ? body.startDate : body.endDate,
      substituteName: body.substituteName || '',
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '신청 실패';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
