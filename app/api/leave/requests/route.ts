import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canApproveLeave } from '@/lib/leaveAccess';
import { createLeaveRequest, listLeaveRequests } from '@/lib/leaveDb';
import type { LeaveKind, LeaveHalfSlot, LeaveRequestStatus } from '@/app/types/leave';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const mine = url.searchParams.get('mine') === '1';
    const pending = url.searchParams.get('pending') === '1';
    const yearParam = url.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : undefined;

    if (pending) {
      if (!canApproveLeave(user)) {
        return NextResponse.json({ error: '결재 목록은 인디만 볼 수 있습니다.' }, { status: 403 });
      }
      const items = await listLeaveRequests({ status: 'pending', year });
      return NextResponse.json({ items, canApprove: true });
    }

    const items = await listLeaveRequests({
      applicantName: mine ? user.name : undefined,
      year,
    });
    return NextResponse.json({
      items: mine ? items : canApproveLeave(user) ? items : items.filter(i => i.applicantName === user.name),
      canApprove: canApproveLeave(user),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      title?: string;
      body?: string;
      leaveKind?: LeaveKind;
      halfSlot?: LeaveHalfSlot | '';
      startDate?: string;
      endDate?: string;
    };
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: '기간을 입력하세요.' }, { status: 400 });
    }
    const leaveKind: LeaveKind = body.leaveKind === 'half' ? 'half' : 'full';
    const item = await createLeaveRequest(user.name, {
      title: body.title || (leaveKind === 'half' ? '반차 승인 계획서' : '연차 승인 계획서'),
      body: body.body,
      leaveKind,
      halfSlot: body.halfSlot,
      startDate: body.startDate,
      endDate: leaveKind === 'half' ? body.startDate : body.endDate,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '신청 실패';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
