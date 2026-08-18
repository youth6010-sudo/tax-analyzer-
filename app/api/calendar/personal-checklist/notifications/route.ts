import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  listUnreadPersonalChecklistNotifications,
  markItemNotificationsRead,
  markPersonalChecklistNotificationsRead,
} from '@/lib/personalChecklistNotifications';

export async function GET() {
  try {
    const user = await requireUser();
    const notifications = await listUnreadPersonalChecklistNotifications(user.name);
    return NextResponse.json({ notifications });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({})) as {
      ids?: string[];
      all?: boolean;
      itemId?: string;
    };
    let count = 0;
    if (body.itemId?.trim()) {
      count = await markItemNotificationsRead(user.name, body.itemId.trim());
    } else if (body.all || !body.ids?.length) {
      count = await markPersonalChecklistNotificationsRead(user.name);
    } else {
      count = await markPersonalChecklistNotificationsRead(user.name, body.ids);
    }
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return handleApiError(e);
  }
}
