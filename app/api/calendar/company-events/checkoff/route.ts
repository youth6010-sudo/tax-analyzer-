import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { setCompanyEventCheckoff } from '@/lib/companyEventCheckoffs';
import { getDb } from '@/db';
import { companyEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json() as { eventId?: string; completed?: boolean };
    if (!body.eventId) {
      return NextResponse.json({ error: 'eventId 필요' }, { status: 400 });
    }

    const db = getDb();
    const [event] = await db
      .select({ id: companyEvents.id })
      .from(companyEvents)
      .where(eq(companyEvents.id, body.eventId))
      .limit(1);
    if (!event) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await setCompanyEventCheckoff(body.eventId, user.name, Boolean(body.completed));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
