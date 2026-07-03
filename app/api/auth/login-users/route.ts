import { NextResponse } from 'next/server';
import { asc, ne } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { canChooseAdminMode, isAlwaysAdminModeLogin } from '@/lib/masterAccess';

export async function GET() {
  try {
    const db = getDb();
    // 숨김용 'admin' 로그인 계정만 제외 — 관리자 역할(예: 찰리)도 로그인 목록에 표시한다.
    const rows = await db
      .select({ loginId: users.loginId, name: users.name, role: users.role })
      .from(users)
      .where(ne(users.loginId, 'admin'))
      .orderBy(asc(users.name));

    return NextResponse.json({
      users: rows.map(u => ({
        ...u,
        canChooseAdminMode: canChooseAdminMode(u.loginId),
        isDeveloperLogin: isAlwaysAdminModeLogin(u.loginId),
      })),
    });
  } catch (e) {
    console.error('login-users error', e);
    return NextResponse.json({ error: '사용자 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
