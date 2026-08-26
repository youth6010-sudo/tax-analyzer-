import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserMenuPrefs, patchAcceptNewClients } from '@/lib/menuPrefsDb';

/** 본인만 수임가능(개인/법인) ON/OFF — 대리 수정 불가 */
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

    if (targetUserId !== user.id) {
      return NextResponse.json(
        { error: '수임가능 설정은 본인만 변경할 수 있습니다.' },
        { status: 403 },
      );
    }

    const flags: { individual?: boolean; corporate?: boolean } = {};
    if (typeof body.individual === 'boolean') flags.individual = body.individual;
    if (typeof body.corporate === 'boolean') flags.corporate = body.corporate;
    if (typeof body.acceptIndividual === 'boolean') flags.individual = body.acceptIndividual;
    if (typeof body.acceptCorporate === 'boolean') flags.corporate = body.acceptCorporate;

    if (flags.individual === undefined && flags.corporate === undefined) {
      return NextResponse.json({ error: 'individual or corporate required' }, { status: 400 });
    }

    const prefs = await patchAcceptNewClients(user.id, flags);
    const accept = prefs.acceptNewClients ?? { individual: false, corporate: false };
    return NextResponse.json({
      prefs,
      acceptIndividual: accept.individual,
      acceptCorporate: accept.corporate,
      userId: user.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('accept-clients PATCH', e);
    return NextResponse.json({ error: 'Failed to save accept prefs' }, { status: 500 });
  }
}
