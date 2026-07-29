import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { emptyMenuPrefs, normalizeMenuPrefs, type UserMenuPrefs } from '@/lib/menuPrefs';

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

export async function setUserMenuPrefs(userId: string, prefs: UserMenuPrefs): Promise<UserMenuPrefs> {
  const db = getDb();
  const normalized = normalizeMenuPrefs(prefs);
  await db.update(users).set({ menuPrefs: normalized }).where(eq(users.id, userId));
  return normalized;
}
