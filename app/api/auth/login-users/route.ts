import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({ loginId: users.loginId, name: users.name, role: users.role })
      .from(users)
      .orderBy(asc(users.name));

    return NextResponse.json({ users: rows });
  } catch (e) {
    console.error('login-users error', e);
    return NextResponse.json({ error: '사용자 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
