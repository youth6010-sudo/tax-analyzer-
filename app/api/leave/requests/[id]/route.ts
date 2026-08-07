import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  canApproveLeaveFinal,
  canReviewLeaveRequest,
  canViewLeavePendingQueue,
} from '@/lib/leaveAccess';
import {
  cancelLeaveRequest,
  deleteCancelledLeaveRequest,
  getLeaveRequest,
  requestLeaveCancel,
  reviewLeaveCancelRequest,
  reviewLeaveRequest,
  withdrawLeaveCancelRequest,
} from '@/lib/leaveDb';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const item = await getLeaveRequest(id);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (
      item.applicantName !== user.name &&
      !canViewLeavePendingQueue(user) &&
      !canApproveLeaveFinal(user)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({
      item,
      canApprove: canReviewLeaveRequest(user, item),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as {
      action?:
        | 'approve'
        | 'reject'
        | 'cancel'
        | 'delete'
        | 'request_cancel'
        | 'withdraw_cancel';
      reviewNote?: string;
      cancelNote?: string;
    };

    if (body.action === 'cancel') {
      const item = await cancelLeaveRequest(id, user.name);
      return NextResponse.json({ item });
    }

    if (body.action === 'request_cancel') {
      const item = await requestLeaveCancel(
        id,
        user.name,
        body.cancelNote ?? body.reviewNote,
      );
      return NextResponse.json({ item });
    }

    if (body.action === 'withdraw_cancel') {
      const item = await withdrawLeaveCancelRequest(id, user.name);
      return NextResponse.json({ item });
    }

    if (body.action === 'delete') {
      await deleteCancelledLeaveRequest(id, user.name);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'approve' || body.action === 'reject') {
      const existing = await getLeaveRequest(id);
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (!canReviewLeaveRequest(user, existing)) {
        return NextResponse.json({ error: '이 단계의 결재 권한이 없습니다.' }, { status: 403 });
      }
      if (existing.status === 'cancel_requested') {
        const item = await reviewLeaveCancelRequest(
          id,
          user.name,
          body.action === 'approve' ? 'approved' : 'rejected',
          body.reviewNote,
        );
        return NextResponse.json({ item });
      }
      const item = await reviewLeaveRequest(
        id,
        user.name,
        body.action === 'approve' ? 'approved' : 'rejected',
        body.reviewNote,
      );
      return NextResponse.json({ item });
    }

    return NextResponse.json({ error: 'action이 필요합니다.' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '처리 실패';
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
