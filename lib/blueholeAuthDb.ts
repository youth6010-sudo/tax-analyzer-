// 담당자별 블루홀 자격증명 + 세션 캐시 (DB 저장)
//   - 비밀번호는 AES-GCM 으로 암호화해 users.bluehole_password_enc 에 저장
//   - 로그인 세션 쿠키(PHPSESSID)는 users.bluehole_session_* 에 캐시 (45분 TTL)
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { encryptSecret, decryptSecret } from './bluehole/crypto';

export interface BlueholeCreds {
  loginId: string;
  password: string;
}

/** 화면 표시용 — 비밀번호 노출 없이 등록 여부만 */
export async function getUserBlueholeAccount(
  userId: string,
): Promise<{ loginId: string; configured: boolean; fallbackAvailable: boolean }> {
  const db = getDb();
  const [row] = await db
    .select({ loginId: users.blueholeLoginId, enc: users.blueholePasswordEnc })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const fallbackAvailable = !!(process.env.BLUEHOLE_LOGIN_ID && process.env.BLUEHOLE_PASSWORD);
  return {
    loginId: row?.loginId ?? '',
    configured: !!(row?.loginId && row?.enc),
    fallbackAvailable,
  };
}

/** 실제 로그인에 사용할 자격증명. DB 우선, 없으면 환경변수 폴백. */
export async function getUserBlueholeCreds(userId: string): Promise<BlueholeCreds | null> {
  const db = getDb();
  const [row] = await db
    .select({ loginId: users.blueholeLoginId, enc: users.blueholePasswordEnc })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row?.loginId && row?.enc) {
    return { loginId: row.loginId, password: decryptSecret(row.enc) };
  }
  if (process.env.BLUEHOLE_LOGIN_ID && process.env.BLUEHOLE_PASSWORD) {
    return { loginId: process.env.BLUEHOLE_LOGIN_ID, password: process.env.BLUEHOLE_PASSWORD };
  }
  return null;
}

export async function setUserBlueholeCreds(userId: string, loginId: string, password: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      blueholeLoginId: loginId,
      blueholePasswordEnc: encryptSecret(password),
      blueholeSessionCookie: '',
      blueholeSessionAt: null,
    })
    .where(eq(users.id, userId));
}

export async function clearUserBlueholeCreds(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      blueholeLoginId: '',
      blueholePasswordEnc: '',
      blueholeSessionCookie: '',
      blueholeSessionAt: null,
    })
    .where(eq(users.id, userId));
}

export async function getUserBlueholeSession(userId: string): Promise<{ cookie: string; at: number } | null> {
  const db = getDb();
  const [row] = await db
    .select({ cookie: users.blueholeSessionCookie, at: users.blueholeSessionAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row?.cookie && row?.at) return { cookie: row.cookie, at: row.at.getTime() };
  return null;
}

export async function setUserBlueholeSession(userId: string, cookie: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ blueholeSessionCookie: cookie, blueholeSessionAt: new Date() })
    .where(eq(users.id, userId));
}

export async function clearUserBlueholeSession(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ blueholeSessionCookie: '', blueholeSessionAt: null })
    .where(eq(users.id, userId));
}

export async function isBlueholeConfiguredForUser(userId: string): Promise<boolean> {
  return (await getUserBlueholeCreds(userId)) !== null;
}
