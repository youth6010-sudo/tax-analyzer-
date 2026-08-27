import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { SessionData } from '@/lib/session';
import { getSessionOptions } from '@/lib/session';
import {
  canChooseAdminMode,
  isAlwaysAdminModeLogin,
} from '@/lib/masterAccess';
import { checkRateLimit, clearRateLimit } from '@/lib/rateLimit';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { loginId?: string; pin?: string; adminMode?: boolean };
    const loginId = body.loginId?.trim().toLowerCase();
    const pin = body.pin?.trim();
    const requestedAdminMode = body.adminMode === true;

    if (!loginId || !pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: '아이디와 4자리 PIN을 입력해 주세요.' }, { status: 400 });
    }

    const rate = await checkRateLimit(`login:${loginId}`);
    if (!rate.ok) {
      return NextResponse.json(
        { error: `로그인 시도가 너무 많습니다. ${rate.retryAfterSec}초 후 다시 시도해 주세요.` },
        { status: 429 },
      );
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.loginId, loginId)).limit(1);

    if (!user || !(await bcrypt.compare(pin, user.pinHash))) {
      return NextResponse.json({ error: '아이디 또는 PIN이 올바르지 않습니다.' }, { status: 401 });
    }

    await clearRateLimit(`login:${loginId}`);

    const adminMode =
      isAlwaysAdminModeLogin(loginId) ||
      (canChooseAdminMode(loginId) && requestedAdminMode);

    const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
    session.user = {
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      adminMode: adminMode || undefined,
    };
    await session.save();

    return NextResponse.json({
      user: session.user,
    });
  } catch (e) {
    console.error('login error', e);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
