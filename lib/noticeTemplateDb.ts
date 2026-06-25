import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';

// 담당자(로그인 계정)별 안내문 서식. 빈 문자열이면 기본 서식 사용.
export async function getUserNoticeTemplate(userId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ noticeTemplate: users.noticeTemplate })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.noticeTemplate ?? '';
}

export async function setUserNoticeTemplate(userId: string, html: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ noticeTemplate: html })
    .where(eq(users.id, userId));
}
