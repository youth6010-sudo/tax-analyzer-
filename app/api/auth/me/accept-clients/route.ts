import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { isDeveloperAdmin } from '@/lib/masterAccess';
import { getUserMenuPrefs, patchAcceptNewClients } from '@/lib/menuPrefsDb';

/** 본인(또는 찰리·리아 관리자 대리) 신규수임 수신 ON/OFF */
export async function GET() {
  try {
    const user = await requireUser();
    const prefs = await getUserMenuPrefs(user.id);
    const accept = prefs.acceptNewClients ?? { individual: false, corporate: false };
    return NextResponse.json({
      acceptIndividual: accept.individual,
      acceptCorporate: accept.corporate,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load accept prefs' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const targetUserId =
      typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : user.id;

    if (targetUserId !== user.id && !isDeveloperAdmin(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (targetUserId !== user.id) {
      const db = getDb();
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!row) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    const flags: { individual?: boolean; corporate?: boolean } = {};
    if (typeof body.individual === 'boolean') flags.individual = body.individual;
    if (typeof body.corporate === 'boolean') flags.corporate = body.corporate;
    if (typeof body.acceptIndividual === 'boolean') flags.individual = body.acceptIndividual;
    if (typeof body.acceptCorporate === 'boolean') flags.corporate = body.acceptCorporate;

    if (flags.individual === undefined && flags.corporate === undefined) {
      return NextResponse.json({ error: 'individual or corporate required' }, { status: 400 });
    }

    const prefs = await patchAcceptNewClients(targetUserId, flags);
    const accept = prefs.acceptNewClients ?? { individual: false, corporate: false };
    return NextResponse.json({
      prefs,
      acceptIndividual: accept.individual,
      acceptCorporate: accept.corporate,
      userId: targetUserId,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('accept-clients PATCH', e);
    return NextResponse.json({ error: 'Failed to save accept prefs' }, { status: 500 });
  }
}
