import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canApproveLeave } from '@/lib/leaveAccess';
import {
  listUnreadLeaveNotifications,
  markLeaveNotificationRead,
} from '@/lib/leaveDb';

export async function GET() {
  try {
    const user = await requireUser();
    if (!canApproveLeave(user)) {
      return NextResponse.json({ items: [], canApprove: false });
    }
    const items = await listUnreadLeaveNotifications(user.name);
    return NextResponse.json({ items, canApprove: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (!canApproveLeave(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await req.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }
    await markLeaveNotificationRead(body.id, user.name);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
