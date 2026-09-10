import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';

import { handleApiError } from '@/lib/apiError';
import { assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/db';
import { clientFeeChanges, clientManagerChanges, users } from '@/db/schema';
import { getClientById, getClientFeeChanges } from '@/lib/clientsDb';
import {
  formatFeeHistorySummary,
  formatManagerHistorySummary,
} from '@/lib/clientEditHistoryFormat';

type HistoryItem = {
  id: string;
  kind: 'fee' | 'manager';
  changedByName: string;
  changedAt: string;
  summary: string;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client);

    const feeChanges = await getClientFeeChanges(id, 50);
    const items: HistoryItem[] = feeChanges.map(c => ({
      id: `fee:${c.id}`,
      kind: 'fee' as const,
      changedByName: c.changedByName || '알 수 없음',
      changedAt: c.changedAt,
      summary: formatFeeHistorySummary(c.previousFee, c.newFee),
    }));

    const db = getDb();
    const mgrRows = await db
      .select({
        id: clientManagerChanges.id,
        previousManager: clientManagerChanges.previousManager,
        newManager: clientManagerChanges.newManager,
        changedAt: clientManagerChanges.changedAt,
        changedByName: users.name,
      })
      .from(clientManagerChanges)
      .leftJoin(users, eq(clientManagerChanges.changedByUserId, users.id))
      .where(eq(clientManagerChanges.clientId, id))
      .orderBy(desc(clientManagerChanges.changedAt))
      .limit(50);

    for (const r of mgrRows) {
      items.push({
        id: `mgr:${r.id}`,
        kind: 'manager',
        changedByName: r.changedByName?.trim() || '알 수 없음',
        changedAt: r.changedAt.toISOString(),
        summary: formatManagerHistorySummary(r.previousManager, r.newManager),
      });
    }

    items.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return handleApiError(e);
  }
}
