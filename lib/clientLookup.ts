import { getDb } from '@/db';
import { clients } from '@/db/schema';

/** Excel·포털 간 수임처 연결 (상호 기준) */
export async function findClientByCompanyName(companyName: string) {
  const name = companyName.trim();
  if (!name) return null;

  const db = getDb();
  const normalized = name.replace(/\s+/g, '');

  const rows = await db.select().from(clients).limit(500);
  const exact = rows.find(r => r.companyName.trim() === name);
  if (exact) return exact;

  const loose = rows.find(
    r =>
      r.companyName.replace(/\s+/g, '') === normalized
      || r.companyName.includes(name)
      || name.includes(r.companyName),
  );
  return loose ?? null;
}

export async function resolveClientId(companyName: string): Promise<string | null> {
  const client = await findClientByCompanyName(companyName);
  return client?.id ?? null;
}
