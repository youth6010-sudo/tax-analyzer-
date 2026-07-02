import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';

/** Vercel·DB 연결 상태 확인 (로그인 필요) */
export async function GET() {
  try {
    await requireUser();
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      ok: true,
      database: true,
      vercel: Boolean(process.env.VERCEL),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
