import { asc, eq, ne } from 'drizzle-orm';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { normalizeAcceptNewClients } from '@/lib/menuPrefs';

/** last_seen 이후 이 시간 이내면 온라인 */
export const PRESENCE_ONLINE_MS = 2 * 60 * 1000;

const STAFF_DISPLAY_ORDER = Object.keys(STAFF_REAL_NAMES);

export type PresenceStaffDto = {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  /** 개인 수임가능 */
  acceptIndividual: boolean;
  /** 법인 수임가능 */
  acceptCorporate: boolean;
};

function sortStaff<T extends { name: string }>(rows: T[]): T[] {
  const order = new Map(STAFF_DISPLAY_ORDER.map((n, i) => [n, i]));
  return [...rows].sort((a, b) => {
    const ai = order.get(a.name);
    const bi = order.get(b.name);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export function isOnline(lastSeenAt: Date | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  return now - lastSeenAt.getTime() <= PRESENCE_ONLINE_MS;
}

export async function touchPresence(userId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
}

export async function listStaffPresence(now = Date.now()): Promise<PresenceStaffDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      lastSeenAt: users.lastSeenAt,
      menuPrefs: users.menuPrefs,
    })
    .from(users)
    .where(ne(users.loginId, 'admin'))
    .orderBy(asc(users.name));

  return sortStaff(
    rows.map(r => {
      const accept = normalizeAcceptNewClients(
        r.menuPrefs && typeof r.menuPrefs === 'object'
          ? (r.menuPrefs as Record<string, unknown>).acceptNewClients
          : undefined,
      );
      return {
        id: r.id,
        name: r.name,
        online: isOnline(r.lastSeenAt, now),
        lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
        acceptIndividual: accept?.individual === true,
        acceptCorporate: accept?.corporate === true,
      };
    }),
  );
}
