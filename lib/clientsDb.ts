import { and, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { churnRecords, clientContacts, clientMeetings, clients, intakeInquiries, intakeProcesses, reportDeliveries, settlementVisits, users } from '@/db/schema';
import type { ContactUpdatePayload } from '@/app/types/contact';
import type { ChurnSummary, ClientStatus } from '@/app/types/client';
import { clientToRecord } from '@/lib/clientMapper';
import { getPrimaryContactNamesByClientIds } from '@/lib/clientContactsDb';

export type ClientPatch = ContactUpdatePayload & {
  intakeData?: Record<string, unknown>;
  feeSummary?: number | null;
  program?: string;
};

export interface ClientListFilters {
  status?: ClientStatus;
  assignedUserId?: string;
  businessEntityType?: string;
  managerName?: string;
  mineOnly?: boolean;
  userId?: string;
  userName?: string;
}

export async function listClients(filters: ClientListFilters = {}) {
  const db = getDb();
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(clients.status, filters.status));
  } else {
    conditions.push(ne(clients.status, 'churned'));
  }

  if (filters.businessEntityType) {
    conditions.push(eq(clients.businessEntityType, filters.businessEntityType));
  }

  if (filters.assignedUserId) {
    conditions.push(eq(clients.assignedUserId, filters.assignedUserId));
  } else if (filters.mineOnly && filters.userId) {
    conditions.push(
      or(eq(clients.assignedUserId, filters.userId), eq(clients.manager, filters.userName ?? '')),
    );
  }

  const rows = await db
    .select()
    .from(clients)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(clients.companyName);

  return rows.map(clientToRecord);
}

export async function getClientById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) return null;
  const record = clientToRecord(row);
  const primaryNames = await getPrimaryContactNamesByClientIds([id]);
  const primaryContactName = primaryNames.get(id);
  return primaryContactName ? { ...record, primaryContactName } : record;
}

export async function searchClients(
  query: string,
  options?: { includeIntake?: boolean; includeChurned?: boolean; activeOnly?: boolean },
) {
  const q = query.trim();
  if (!q) return [];

  const db = getDb();
  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const digits = q.replace(/\D/g, '');
  const qLower = q.toLowerCase();

  let statusCond;
  if (options?.activeOnly) {
    statusCond = eq(clients.status, 'active');
  } else if (options?.includeChurned) {
    statusCond = or(
      eq(clients.status, 'active'),
      eq(clients.status, 'intake'),
      eq(clients.status, 'churned'),
    );
  } else if (options?.includeIntake !== false) {
    statusCond = or(eq(clients.status, 'active'), eq(clients.status, 'intake'));
  } else {
    statusCond = eq(clients.status, 'active');
  }

  const matchedContactByClient = new Map<string, string>();
  const contactClientIdSet = new Set<string>();

  const contactTextConds = [
    ilike(clientContacts.name, pattern),
    ilike(clientContacts.role, pattern),
    ilike(clientContacts.phone, pattern),
    ilike(clientContacts.mobilePhone, pattern),
    ilike(clientContacts.contactKind, pattern),
  ];

  if (digits.length >= 2) {
    contactTextConds.push(
      sql`replace(replace(${clientContacts.phone}, '-', ''), ' ', '') like ${'%' + digits + '%'}`,
      sql`replace(replace(${clientContacts.mobilePhone}, '-', ''), ' ', '') like ${'%' + digits + '%'}`,
    );
  }

  const contactHits = await db
    .select({ clientId: clientContacts.clientId, name: clientContacts.name })
    .from(clientContacts)
    .innerJoin(clients, eq(clients.id, clientContacts.clientId))
    .where(and(statusCond, or(...contactTextConds)))
    .limit(60);

  for (const hit of contactHits) {
    contactClientIdSet.add(hit.clientId);
    const name = hit.name.trim();
    if (!name) continue;
    const prev = matchedContactByClient.get(hit.clientId);
    const nameMatches = name.toLowerCase().includes(qLower);
    if (!prev || (nameMatches && !prev.toLowerCase().includes(qLower))) {
      matchedContactByClient.set(hit.clientId, name);
    }
  }

  const clientConds = [
    ilike(clients.companyName, pattern),
    ilike(clients.representative, pattern),
    ilike(clients.manager, pattern),
    ilike(clients.phone, pattern),
    sql`${clients.intakeData}->>'mobilePhone' ilike ${pattern}`,
    sql`${clients.intakeData}->>'clientContact' ilike ${pattern}`,
    sql`${clients.intakeData}->>'callNote' ilike ${pattern}`,
  ];

  if (contactClientIdSet.size > 0) {
    clientConds.push(inArray(clients.id, [...contactClientIdSet]));
  }

  if (digits.length >= 2) {
    clientConds.push(
      sql`replace(replace(${clients.businessNo}, '-', ''), ' ', '') like ${'%' + digits + '%'}`,
      sql`replace(replace(${clients.corporateNo}, '-', ''), ' ', '') like ${'%' + digits + '%'}`,
      sql`replace(replace(${clients.phone}, '-', ''), ' ', '') like ${'%' + digits + '%'}`,
      sql`replace(replace(${clients.intakeData}->>'mobilePhone', '-', ''), ' ', '') like ${'%' + digits + '%'}`,
    );
  }

  const rows = await db
    .select()
    .from(clients)
    .where(and(statusCond, or(...clientConds)))
    .limit(40);

  const sorted = [...rows].sort((a, b) => {
    const aContact = contactClientIdSet.has(a.id) ? 0 : 1;
    const bContact = contactClientIdSet.has(b.id) ? 0 : 1;
    if (aContact !== bContact) return aContact - bContact;
    return a.companyName.localeCompare(b.companyName, 'ko');
  });

  const sliced = sorted.slice(0, 20);
  const clientIds = sliced.map(r => r.id);
  const primaryNames = await getPrimaryContactNamesByClientIds(clientIds);
  const churnedIds = sliced.filter(r => r.status === 'churned').map(r => r.id);
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

  return sliced.map(r => ({
    ...clientToRecord(r),
    churn: churnByClient.get(r.id) ?? null,
    primaryContactName: primaryNames.get(r.id),
    matchedContactName: matchedContactByClient.get(r.id),
  }));
}

export async function createIntakeClient(assignedUserId: string, managerName: string) {
  const db = getDb();
  const [row] = await db
    .insert(clients)
    .values({
      companyName: '(유입 진행중)',
      manager: managerName,
      status: 'intake',
      assignedUserId,
      source: 'manual_intake',
      intakeStep: 0,
      intakeData: {},
    })
    .returning();
  return clientToRecord(row);
}

export async function updateClientIntake(
  id: string,
  data: { intakeStep?: number; intakeData?: Record<string, unknown>; patch?: Partial<ContactUpdatePayload> },
) {
  const db = getDb();
  const existing = await getClientById(id);
  if (!existing || existing.status !== 'intake') throw new Error('NOT_FOUND');

  const patch = data.patch ?? {};
  const mergedIntake = { ...(existing.intakeData ?? {}), ...(data.intakeData ?? {}) };
  if (patch.mobilePhone !== undefined) mergedIntake.mobilePhone = patch.mobilePhone.trim();

  const [row] = await db
    .update(clients)
    .set({
      ...(patch.companyName !== undefined ? { companyName: patch.companyName } : {}),
      ...(patch.manager !== undefined ? { manager: patch.manager } : {}),
      ...(patch.representative !== undefined ? { representative: patch.representative } : {}),
      ...(patch.businessNo !== undefined ? { businessNo: patch.businessNo } : {}),
      ...(patch.corporateNo !== undefined ? { corporateNo: patch.corporateNo } : {}),
      ...(patch.residentNo !== undefined ? { residentNo: patch.residentNo } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.fax !== undefined ? { fax: patch.fax } : {}),
      ...(patch.taxTypes !== undefined ? { taxTypes: patch.taxTypes } : {}),
      ...(patch.businessEntityType !== undefined ? { businessEntityType: patch.businessEntityType } : {}),
      ...(patch.serviceTypes !== undefined ? { serviceTypes: patch.serviceTypes } : {}),
      ...(data.intakeStep !== undefined ? { intakeStep: data.intakeStep } : {}),
      intakeData: mergedIntake,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id))
    .returning();

  return clientToRecord(row);
}

export async function completeIntake(id: string, assignedUserId: string) {
  const db = getDb();
  const existing = await getClientById(id);
  if (!existing || existing.status !== 'intake') throw new Error('NOT_FOUND');
  if (!existing.companyName.trim() || existing.companyName === '(유입 진행중)') {
    throw new Error('COMPANY_NAME_REQUIRED');
  }

  const [row] = await db
    .update(clients)
    .set({
      status: 'active',
      assignedUserId,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id))
    .returning();

  return clientToRecord(row);
}

export async function updateClient(id: string, payload: ClientPatch) {
  const db = getDb();
  if (!payload.companyName.trim()) throw new Error('COMPANY_NAME_REQUIRED');

  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  const mergedIntake = {
    ...(existing.intakeData ?? {}),
    ...(payload.intakeData ?? {}),
  };
  if (payload.mobilePhone !== undefined) {
    mergedIntake.mobilePhone = payload.mobilePhone.trim();
  }

  const [row] = await db
    .update(clients)
    .set({
      companyName: payload.companyName.trim(),
      manager: payload.manager.trim(),
      representative: payload.representative.trim(),
      businessNo: payload.businessNo.trim(),
      corporateNo: payload.corporateNo.trim(),
      residentNo: payload.residentNo.trim(),
      phone: payload.phone.trim(),
      fax: payload.fax.trim(),
      taxTypes: payload.taxTypes,
      businessEntityType: payload.businessEntityType || '',
      serviceTypes: payload.serviceTypes,
      ...(payload.feeSummary !== undefined ? { feeSummary: payload.feeSummary } : {}),
      ...(payload.program !== undefined ? { program: payload.program.trim() } : {}),
      intakeData: mergedIntake,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id))
    .returning();

  if (!row) throw new Error('NOT_FOUND');
  return clientToRecord(row);
}

export async function updateClientDetail(
  id: string,
  patch: { intakeData: Record<string, unknown>; feeSummary?: number | null; program?: string },
) {
  const db = getDb();
  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  const [row] = await db
    .update(clients)
    .set({
      intakeData: { ...(existing.intakeData ?? {}), ...patch.intakeData },
      ...(patch.feeSummary !== undefined ? { feeSummary: patch.feeSummary } : {}),
      ...(patch.program !== undefined ? { program: patch.program.trim() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id))
    .returning();

  if (!row) throw new Error('NOT_FOUND');
  return clientToRecord(row);
}

export async function churnClient(
  id: string,
  data: {
    reason: string;
    detail?: string;
    churnedAt?: string;
    feeAmount?: number | null;
    dataCleanup?: string;
    churnType?: string;
    earlySign?: string;
    manager?: string;
  },
  recordedByUserId: string,
) {
  const db = getDb();
  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  if (existing.status === 'intake') throw new Error('NOT_FOUND');

  const existingRecord = await getChurnRecordByClientId(id);
  if (existingRecord) throw new Error('ALREADY_HAS_RECORD');

  const churnedAt = data.churnedAt?.trim()
    ? new Date(data.churnedAt.trim())
    : new Date();

  await db.insert(churnRecords).values({
    clientId: id,
    companyName: existing.companyName,
    manager: data.manager?.trim() || existing.manager,
    reason: data.reason.trim(),
    detail: data.detail?.trim() ?? '',
    churnType: data.churnType?.trim() ?? '',
    dataCleanup: data.dataCleanup?.trim() ?? '',
    earlySign: data.earlySign?.trim() ?? '',
    feeAmount: data.feeAmount ?? existing.feeSummary ?? null,
    churnedAt,
    recordedByUserId,
  });

  if (existing.status === 'active') {
    const [row] = await db
      .update(clients)
      .set({ status: 'churned', updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return clientToRecord(row);
  }

  return existing;
}

export async function getChurnRecordByClientId(clientId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: churnRecords.id,
      clientId: churnRecords.clientId,
      companyName: sql<string>`coalesce(${clients.companyName}, ${churnRecords.companyName})`,
      manager: churnRecords.manager,
      reason: churnRecords.reason,
      detail: churnRecords.detail,
      churnType: churnRecords.churnType,
      dataCleanup: churnRecords.dataCleanup,
      earlySign: churnRecords.earlySign,
      feeAmount: churnRecords.feeAmount,
      churnedAt: churnRecords.churnedAt,
      recordedByName: users.name,
    })
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .leftJoin(users, eq(churnRecords.recordedByUserId, users.id))
    .where(eq(churnRecords.clientId, clientId))
    .orderBy(desc(churnRecords.churnedAt))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: row.companyName,
    manager: row.manager,
    reason: row.reason,
    detail: row.detail,
    churnType: row.churnType,
    dataCleanup: row.dataCleanup,
    earlySign: row.earlySign,
    feeAmount: row.feeAmount,
    churnedAt: row.churnedAt.toISOString(),
    recordedByName: row.recordedByName,
  };
}

export async function listChurnRecords() {
  const db = getDb();
  const rows = await db
    .select({
      id: churnRecords.id,
      clientId: churnRecords.clientId,
      companyName: sql<string>`coalesce(${clients.companyName}, ${churnRecords.companyName})`,
      manager: sql<string>`coalesce(${clients.manager}, ${churnRecords.manager})`,
      reason: churnRecords.reason,
      detail: churnRecords.detail,
      churnType: churnRecords.churnType,
      dataCleanup: churnRecords.dataCleanup,
      earlySign: churnRecords.earlySign,
      feeAmount: churnRecords.feeAmount,
      churnedAt: churnRecords.churnedAt,
      recordedByName: users.name,
    })
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .leftJoin(users, eq(churnRecords.recordedByUserId, users.id))
    .orderBy(sql`${churnRecords.churnedAt} desc`);

  return rows.map(r => ({
    id: r.id,
    clientId: r.clientId,
    companyName: r.companyName,
    manager: r.manager,
    reason: r.reason,
    detail: r.detail,
    churnType: r.churnType,
    dataCleanup: r.dataCleanup,
    earlySign: r.earlySign,
    feeAmount: r.feeAmount,
    churnedAt: r.churnedAt.toISOString(),
    recordedByName: r.recordedByName,
  }));
}

export async function listChurnedClientsWithoutRecord() {
  const db = getDb();
  const linkedIds = await db
    .select({ clientId: churnRecords.clientId })
    .from(churnRecords)
    .where(sql`${churnRecords.clientId} is not null`);

  const linkedSet = new Set(linkedIds.map(r => r.clientId).filter(Boolean) as string[]);

  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.status, 'churned'))
    .orderBy(clients.companyName);

  return rows.filter(r => !linkedSet.has(r.id)).map(clientToRecord);
}

export async function updateChurnRecord(
  id: string,
  data: {
    reason?: string;
    detail?: string;
    churnedAt?: string;
    feeAmount?: number | null;
    dataCleanup?: string;
    churnType?: string;
    earlySign?: string;
    manager?: string;
  },
) {
  const db = getDb();
  const patch: Record<string, unknown> = {};
  if (data.reason !== undefined) patch.reason = data.reason.trim();
  if (data.detail !== undefined) patch.detail = data.detail.trim();
  if (data.churnType !== undefined) patch.churnType = data.churnType.trim();
  if (data.dataCleanup !== undefined) patch.dataCleanup = data.dataCleanup.trim();
  if (data.earlySign !== undefined) patch.earlySign = data.earlySign.trim();
  if (data.manager !== undefined) patch.manager = data.manager.trim();
  if (data.feeAmount !== undefined) patch.feeAmount = data.feeAmount;
  if (data.churnedAt !== undefined && data.churnedAt.trim()) {
    patch.churnedAt = new Date(data.churnedAt.trim());
  }

  const [row] = await db
    .update(churnRecords)
    .set(patch)
    .where(eq(churnRecords.id, id))
    .returning();

  if (!row) throw new Error('NOT_FOUND');

  const full = await db
    .select({
      id: churnRecords.id,
      clientId: churnRecords.clientId,
      companyName: sql<string>`coalesce(${clients.companyName}, ${churnRecords.companyName})`,
      manager: sql<string>`coalesce(${clients.manager}, ${churnRecords.manager})`,
      reason: churnRecords.reason,
      detail: churnRecords.detail,
      churnType: churnRecords.churnType,
      dataCleanup: churnRecords.dataCleanup,
      earlySign: churnRecords.earlySign,
      feeAmount: churnRecords.feeAmount,
      churnedAt: churnRecords.churnedAt,
      recordedByName: users.name,
    })
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .leftJoin(users, eq(churnRecords.recordedByUserId, users.id))
    .where(eq(churnRecords.id, id))
    .limit(1);

  const r = full[0];
  return {
    id: r.id,
    clientId: r.clientId,
    companyName: r.companyName,
    manager: r.manager,
    reason: r.reason,
    detail: r.detail,
    churnType: r.churnType,
    dataCleanup: r.dataCleanup,
    earlySign: r.earlySign,
    feeAmount: r.feeAmount,
    churnedAt: r.churnedAt.toISOString(),
    recordedByName: r.recordedByName,
  };
}

export async function deleteChurnRecord(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(churnRecords).where(eq(churnRecords.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');

  const clientId = existing.clientId;
  await db.delete(churnRecords).where(eq(churnRecords.id, id));

  if (clientId) {
    const remaining = await db
      .select({ id: churnRecords.id })
      .from(churnRecords)
      .where(eq(churnRecords.clientId, clientId))
      .limit(1);
    if (remaining.length === 0) {
      await db
        .update(clients)
        .set({ status: 'active', updatedAt: new Date() })
        .where(and(eq(clients.id, clientId), eq(clients.status, 'churned')));
    }
  }
}

async function detachClientLinks(clientId: string) {
  const db = getDb();
  await db.update(intakeInquiries).set({ clientId: null }).where(eq(intakeInquiries.clientId, clientId));
  await db.update(intakeProcesses).set({ clientId: null }).where(eq(intakeProcesses.clientId, clientId));
  await db.update(churnRecords).set({ clientId: null }).where(eq(churnRecords.clientId, clientId));
  await db.update(clientMeetings).set({ clientId: null }).where(eq(clientMeetings.clientId, clientId));
  await db.update(reportDeliveries).set({ clientId: null }).where(eq(reportDeliveries.clientId, clientId));
  await db.update(settlementVisits).set({ clientId: null }).where(eq(settlementVisits.clientId, clientId));
}

export async function deleteClientById(id: string) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  await detachClientLinks(id);
  const db = getDb();
  await db.delete(clients).where(eq(clients.id, id));
  return { deletedId: id, companyName: existing.companyName };
}

export async function upsertClientFromImport(data: {
  id?: string;
  companyName: string;
  manager: string;
  phone?: string;
  fax?: string;
  taxTypes: string[];
  businessEntityType?: string;
  serviceTypes?: string[];
  assignedUserId?: string | null;
}) {
  const db = getDb();
  const key = `${data.companyName}||${data.manager}`;

  const all = await db.select().from(clients);
  const existing = all.find(c => `${c.companyName}||${c.manager}` === key);

  if (existing) {
    if (existing.status === 'intake' || existing.status === 'churned') {
      return clientToRecord(existing);
    }
    const [row] = await db
      .update(clients)
      .set({
        phone: data.phone ?? existing.phone,
        fax: data.fax ?? existing.fax,
        taxTypes: data.taxTypes.length > 0 ? data.taxTypes : existing.taxTypes,
        assignedUserId: data.assignedUserId ?? existing.assignedUserId,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, existing.id))
      .returning();
    return clientToRecord(row);
  }

  const [row] = await db
    .insert(clients)
    .values({
      id: data.id,
      companyName: data.companyName,
      manager: data.manager,
      phone: data.phone ?? '',
      fax: data.fax ?? '',
      taxTypes: data.taxTypes,
      businessEntityType: data.businessEntityType ?? '',
      serviceTypes: data.serviceTypes ?? [],
      status: 'active',
      source: 'tp_import',
      assignedUserId: data.assignedUserId ?? null,
    })
    .returning();

  return clientToRecord(row);
}

export async function findUserByName(name: string) {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [row] = await db.select().from(users).where(eq(users.name, trimmed)).limit(1);
  return row ?? null;
}
