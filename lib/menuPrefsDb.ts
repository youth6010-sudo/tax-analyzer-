import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import {
  emptyMenuPrefs,
  normalizeAcceptNewClients,
  normalizeMenuPrefs,
  type AcceptNewClientsPrefs,
  type UserMenuPrefs,
} from '@/lib/menuPrefs';

export async function getUserMenuPrefs(userId: string): Promise<UserMenuPrefs> {
  const db = getDb();
  const [row] = await db
    .select({ menuPrefs: users.menuPrefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return emptyMenuPrefs();
  return normalizeMenuPrefs(row.menuPrefs);
}

/**
 * 메뉴 편집 저장 시 acceptNewClients가 빠지면 기존 수신 설정을 유지.
 * `replace: true`면 전체 교체(리셋).
 */
export async function setUserMenuPrefs(
  userId: string,
  prefs: UserMenuPrefs,
  opts?: { replace?: boolean },
): Promise<UserMenuPrefs> {
  const db = getDb();
  const normalized = normalizeMenuPrefs(prefs);
  let next: UserMenuPrefs = normalized;
  if (!opts?.replace) {
    const existing = await getUserMenuPrefs(userId);
    if (!normalized.acceptNewClients && existing.acceptNewClients) {
      next = { ...normalized, acceptNewClients: existing.acceptNewClients };
    }
  }
  await db.update(users).set({ menuPrefs: next }).where(eq(users.id, userId));
  return next;
}

export async function patchAcceptNewClients(
  userId: string,
  flags: Partial<AcceptNewClientsPrefs>,
): Promise<UserMenuPrefs> {
  const existing = await getUserMenuPrefs(userId);
  const prev = existing.acceptNewClients ?? { individual: false, corporate: false };
  const acceptNewClients = normalizeAcceptNewClients({
    individual: flags.individual ?? prev.individual,
    corporate: flags.corporate ?? prev.corporate,
  }) ?? { individual: false, corporate: false };
  return setUserMenuPrefs(userId, { ...existing, acceptNewClients }, { replace: true });
}
