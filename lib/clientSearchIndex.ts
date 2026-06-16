import { desc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { churnRecords, clients } from '@/db/schema';
import type { ChurnSummary, ClientSearchResult } from '@/app/types/client';
import { clientToRecord } from '@/lib/clientMapper';
import { intakeSearchText } from '@/app/utils/searchNormalize';
import {
  getContactSearchDataByClientIds,
  getPrimaryContactNamesByClientIds,
} from '@/lib/clientContactsDb';

/** 헤더 검색용 — active·intake·churned 전체 */
export async function listClientSearchIndex(): Promise<ClientSearchResult[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(clients)
    .where(or(
      eq(clients.status, 'active'),
      eq(clients.status, 'intake'),
      eq(clients.status, 'churned'),
    ))
    .orderBy(clients.companyName);

  const churnedIds = rows.filter(r => r.status === 'churned').map(r => r.id);
  const churnByClient = new Map<string, ChurnSummary>();

  if (churnedIds.length > 0) {
    const churnRows = await db
      .select()
      .from(churnRecords)
      .where(inArray(churnRecords.clientId, churnedIds))
      .orderBy(desc(churnRecords.churnedAt));

    for (const c of churnRows) {
      if (c.clientId && !churnByClient.has(c.clientId)) {
        churnByClient.set(c.clientId, {
          id: c.id,
          churnedAt: c.churnedAt.toISOString(),
          reason: c.reason,
          detail: c.detail,
          churnType: c.churnType,
          dataCleanup: c.dataCleanup,
          earlySign: c.earlySign,
          feeAmount: c.feeAmount,
        });
      }
    }
  }

  const ids = rows.map(r => r.id);
  const [primaryNames, contactSearch] = await Promise.all([
    getPrimaryContactNamesByClientIds(ids),
    getContactSearchDataByClientIds(ids),
  ]);

  return rows.map(r => {
    const record = clientToRecord(r);
    const primaryContactName = primaryNames.get(r.id);
    const contacts = contactSearch.get(r.id);
    const extraIntake = intakeSearchText(record.intakeData);
    return {
      ...(primaryContactName ? { ...record, primaryContactName } : record),
      churn: churnByClient.get(r.id) ?? null,
      ...(contacts?.searchText ? { contactSearchText: contacts.searchText } : {}),
      ...(contacts?.contactNames.length ? { contactNames: contacts.contactNames } : {}),
      ...(extraIntake ? { intakeSearchText: extraIntake } : {}),
    };
  });
}

