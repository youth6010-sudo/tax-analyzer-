import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  listUnreadPersonalChecklistNotifications,
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
    const body = await req.json().catch(() => ({})) as { ids?: string[]; all?: boolean };
    const count = body.all || !body.ids?.length
      ? await markPersonalChecklistNotificationsRead(user.name)
      : await markPersonalChecklistNotificationsRead(user.name, body.ids);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return handleApiError(e);
  }
}
