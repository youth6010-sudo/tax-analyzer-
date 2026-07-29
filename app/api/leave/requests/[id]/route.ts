import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canApproveLeave } from '@/lib/leaveAccess';
import {
  cancelLeaveRequest,
  getLeaveRequest,
  reviewLeaveRequest,
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
    if (item.applicantName !== user.name && !canApproveLeave(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ item });
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
      action?: 'approve' | 'reject' | 'cancel';
      reviewNote?: string;
    };

    if (body.action === 'cancel') {
      const item = await cancelLeaveRequest(id, user.name);
      return NextResponse.json({ item });
    }

    if (body.action === 'approve' || body.action === 'reject') {
      if (!canApproveLeave(user)) {
        return NextResponse.json({ error: '연차 승인은 인디만 할 수 있습니다.' }, { status: 403 });
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
