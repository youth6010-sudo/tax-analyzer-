import { and, asc, eq, ne, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients } from '@/db/schema';

export type BlueholeUnlinkedClient = {
  id: string;
  companyName: string;
  manager: string;
  representative: string;
  businessNo: string;
  businessEntityType: string;
  status: 'active' | 'churned';
};

/**
 * 블루홀 거래처와 연결되지 않은(blueholeClientId가 비어 있는) 수임처 목록.
 * 유입 진행중(intake) 단계는 제외하고 active·churned만 반환한다.
 */
export async function listBlueholeUnlinkedClients(): Promise<BlueholeUnlinkedClient[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      manager: clients.manager,
      representative: clients.representative,
      businessNo: clients.businessNo,
      businessEntityType: clients.businessEntityType,
      status: clients.status,
    })
    .from(clients)
    .where(
      and(
        eq(clients.blueholeClientId, ''),
        or(eq(clients.status, 'active'), eq(clients.status, 'churned')),
        ne(clients.status, 'intake'),
      ),
    )
    .orderBy(asc(clients.companyName));

  return rows.map(r => ({
    id: r.id,
    companyName: r.companyName,
    manager: r.manager,
    representative: r.representative,
    businessNo: r.businessNo,
    businessEntityType: r.businessEntityType,
    status: r.status === 'churned' ? 'churned' : 'active',
  }));
}
