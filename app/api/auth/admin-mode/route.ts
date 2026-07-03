import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { SessionData } from '@/lib/session';
import { getSessionOptions } from '@/lib/session';
import { canToggleAdminMode } from '@/lib/masterAccess';
import { requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!canToggleAdminMode(user)) {
      return NextResponse.json({ error: '관리자 모드 전환 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await request.json()) as { adminMode?: boolean };
    if (typeof body.adminMode !== 'boolean') {
      return NextResponse.json({ error: 'adminMode 값이 필요합니다.' }, { status: 400 });
    }

    const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
    if (!session.user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    session.user = {
      ...session.user,
      adminMode: body.adminMode || undefined,
    };
    await session.save();

    return NextResponse.json({ user: session.user });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    console.error('admin-mode error', e);
    return NextResponse.json({ error: '관리자 모드 변경 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
