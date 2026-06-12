import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const sessionUser = await requireUser();
    const body = (await request.json()) as { currentPin?: string; newPin?: string };

    const currentPin = body.currentPin?.trim() ?? '';
    const newPin = body.newPin?.trim() ?? '';

    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      return NextResponse.json({ error: 'PIN은 4자리 숫자여야 합니다.' }, { status: 400 });
    }

    if (currentPin === newPin) {
      return NextResponse.json({ error: '새 PIN은 현재 PIN과 달라야 합니다.' }, { status: 400 });
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);

    if (!user || !(await bcrypt.compare(currentPin, user.pinHash))) {
      return NextResponse.json({ error: '현재 PIN이 올바르지 않습니다.' }, { status: 401 });
    }

    const pinHash = await bcrypt.hash(newPin, 10);
    await db.update(users).set({ pinHash }).where(eq(users.id, user.id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('change-pin error', e);
    return NextResponse.json({ error: 'PIN 변경 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
