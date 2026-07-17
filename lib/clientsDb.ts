import { and, asc, desc, eq, gt, ilike, inArray, isNull, ne, notExists, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { churnRecords, clientContacts, clientFeeChanges, clientMeetings, clients, intakeInquiries, intakeProcesses, reportDeliveries, settlementVisits, users } from '@/db/schema';
import type { ContactUpdatePayload } from '@/app/types/contact';
import type { ChurnSummary, ClientFeeChange, ClientStatus } from '@/app/types/client';
import {
  clientIndicatesBusinessClosure,
  normalizeChurnClosureFields,
  type ChurnClientClosureHint,
} from '@/app/config/churnOptions';
import { clientToListRecord, clientToRecord } from '@/lib/clientMapper';
import { computeFeeSummaryFromItems, feeItemsEqual, readFeeItems, type FeeLineItem } from '@/app/utils/feeBreakdown';
import { getPrimaryContactNamesByClientIds } from '@/lib/clientContactsDb';
import { buildMineOnlyClientCondition, mergeClientConditions } from '@/lib/clientAccess';
import {
  dedupeClientsForChurnSearch,
  filterClientsForChurnRegistration,
} from '@/app/utils/churnMatch';

export type ClientPatch = ContactUpdatePayload & {
  intakeData?: Record<string, unknown>;
  feeSummary?: number | null;
  program?: string;
};

export interface ClientListFilters {
  status?: ClientStatus;
  includeChurned?: boolean;
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
  } else if (filters.includeChurned) {
    conditions.push(or(eq(clients.status, 'active'), eq(clients.status, 'churned')));
  } else {
    conditions.push(ne(clients.status, 'churned'));
  }

  if (filters.businessEntityType) {
    conditions.push(eq(clients.businessEntityType, filters.businessEntityType));
  }

  if (filters.assignedUserId) {
    conditions.push(eq(clients.assignedUserId, filters.assignedUserId));
  } else if (filters.mineOnly && filters.userId) {
    const mineCond = buildMineOnlyClientCondition(filters.userId, filters.userName ?? '');
    if (mineCond) conditions.push(mineCond);
  }

  const rows = await db
    .select()
    .from(clients)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(clients.companyName);

  const records = rows.map(clientToListRecord);
  const churnedIds = records.filter(r => r.status === 'churned').map(r => r.id);
  if (churnedIds.length === 0) return records;

  const churnRows = await db
    .select()
    .from(churnRecords)
    .where(inArray(churnRecords.clientId, churnedIds))
    .orderBy(desc(churnRecords.churnedAt));

  const churnByClient = new Map<string, ChurnSummary>();
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

  return records.map(r =>
    r.status === 'churned' ? { ...r, churn: churnByClient.get(r.id) ?? null } : r,
  );
}

export async function getClientById(id: string) {
  const db = getDb();
  // 클라이언트 행과 연락처를 한 번의 병렬 라운드트립으로 — DB가 원거리(고지연)일 때 순차 쿼리 비용을 줄인다.
  const [clientRows, contactRows] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, id)).limit(1),
    db
      .select({
        name: clientContacts.name,
        mobilePhone: clientContacts.mobilePhone,
        phone: clientContacts.phone,
        isPrimary: clientContacts.isPrimary,
      })
      .from(clientContacts)
      .where(eq(clientContacts.clientId, id))
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name)),
  ]);

  const row = clientRows[0];
  if (!row) return null;

  // is_primary 우선, 없으면 첫 연락처
  const primary = contactRows.find(c => c.isPrimary) ?? contactRows[0];
  const primaryContactName = primary?.name?.trim() || undefined;
  const primaryContactMobile = (primary?.mobilePhone?.trim() || primary?.phone?.trim()) || undefined;

  const record = clientToRecord(row, { primaryContactMobile });
  return primaryContactName ? { ...record, primaryContactName } : record;
}

/** id 목록으로 수임처 목록 조회 (listClients와 동일한 목록 레코드 형식) */
export async function getClientsByIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const db = getDb();
  const rows = await db.select().from(clients).where(inArray(clients.id, unique));
  const records = rows.map(clientToListRecord);

  const churnedIds = records.filter(r => r.status === 'churned').map(r => r.id);
  if (churnedIds.length === 0) return records;

  const churnRows = await db
    .select()
    .from(churnRecords)
    .where(inArray(churnRecords.clientId, churnedIds))
    .orderBy(desc(churnRecords.churnedAt));

  const churnByClient = new Map<string, ChurnSummary>();
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

  return records.map(r =>
    r.status === 'churned' ? { ...r, churn: churnByClient.get(r.id) ?? null } : r,
  );
}

/** 여러 수임처 id → 상호 맵 (감사 로그 등 표시용) */
export async function getClientNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(inArray(clients.id, unique));
  for (const r of rows) map.set(r.id, r.companyName);
  return map;
}

/** 수임처에 연결된 블루홀 거래처 ID. 수임처가 없으면 null, 미연결이면 '' 반환. */
export async function getClientBlueholeId(id: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ blueholeClientId: clients.blueholeClientId })
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  return row ? row.blueholeClientId || '' : null;
}

/** 수임처에 블루홀 거래처 ID를 연결(빈 문자열이면 해제). */
export async function setClientBlueholeId(id: string, blueholeClientId: string): Promise<void> {
  const db = getDb();
  await db
    .update(clients)
    .set({ blueholeClientId: blueholeClientId.trim(), updatedAt: new Date() })
    .where(eq(clients.id, id));
}

export interface NtsStatusInput {
  status: string;
  statusCode: string;
  taxType: string;
  closedDate: string;
}

/** 국세청 상태조회 결과 캐시 저장. (updatedAt은 건드리지 않는다 — 상태조회는 정보 수정이 아님) */
export async function setClientNtsStatus(id: string, status: NtsStatusInput): Promise<void> {
  const db = getDb();
  await db
    .update(clients)
    .set({
      ntsStatus: status.status || '',
      ntsStatusCode: status.statusCode || '',
      ntsTaxType: status.taxType || '',
      ntsClosedDate: status.closedDate || '',
      ntsCheckedAt: new Date(),
    })
    .where(eq(clients.id, id));
}

/** 휴/폐업 제외 전체 활성 수임처의 사업자번호 (정기 점검용). [{ id, businessNo }] */
export async function listActiveClientBusinessNos(): Promise<Array<{ id: string; businessNo: string }>> {
  const db = getDb();
  const rows = await db
    .select({ id: clients.id, businessNo: clients.businessNo })
    .from(clients)
    .where(ne(clients.status, 'churned'));
  return rows
    .map(r => ({ id: r.id, businessNo: r.businessNo || '' }))
    .filter(r => r.businessNo.replace(/\D/g, '').length === 10);
}

/** 여러 수임처의 사업자번호(상태조회 대상). { id: businessNo } 맵. */
export async function getClientBusinessNos(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({ id: clients.id, businessNo: clients.businessNo })
    .from(clients)
    .where(inArray(clients.id, unique));
  for (const r of rows) map.set(r.id, r.businessNo || '');
  return map;
}

export async function searchClients(
  query: string,
  options?: {
    includeIntake?: boolean;
    includeChurned?: boolean;
    activeOnly?: boolean;
    mineOnly?: boolean;
    userId?: string;
    userName?: string;
    forChurn?: boolean;
  },
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

  let mineCond: SQL | undefined;
  if (options?.mineOnly && options.userId) {
    mineCond = buildMineOnlyClientCondition(options.userId, options.userName ?? '');
  }
  const accessCond = mergeClientConditions(statusCond, mineCond);

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
    .where(and(accessCond, or(...contactTextConds)))
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
    .where(and(accessCond, or(...clientConds)))
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

  const mapped = sliced.map(r => ({
    ...clientToRecord(r),
    churn: churnByClient.get(r.id) ?? null,
    primaryContactName: primaryNames.get(r.id),
    matchedContactName: matchedContactByClient.get(r.id),
  }));

  if (!options?.forChurn) return mapped;

  const churnLinks = await db
    .select({ clientId: churnRecords.clientId, companyName: churnRecords.companyName })
    .from(churnRecords);
  const churnRecordViews = churnLinks.map((row, i) => ({
    id: `search-churn-${i}`,
    clientId: row.clientId,
    companyName: row.companyName,
    manager: '',
    reason: '',
    detail: '',
    churnType: '',
    dataCleanup: '',
    earlySign: '',
    feeAmount: null,
    churnedAt: '',
    recordedByName: null,
  }));

  return filterClientsForChurnRegistration(dedupeClientsForChurnSearch(mapped), churnRecordViews);
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
  patch: {
    intakeData: Record<string, unknown>;
    feeSummary?: number | null;
    program?: string;
    businessEntityType?: string;
  },
) {
  const db = getDb();
  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  const mergedIntake = mergeIntakeDataPatch(existing.intakeData, patch.intakeData);

  const [row] = await db
    .update(clients)
    .set({
      intakeData: mergedIntake,
      ...(patch.feeSummary !== undefined ? { feeSummary: patch.feeSummary } : {}),
      ...(patch.program !== undefined ? { program: patch.program.trim() } : {}),
      ...(patch.businessEntityType !== undefined
        ? { businessEntityType: patch.businessEntityType || '' }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id))
    .returning();

  if (!row) throw new Error('NOT_FOUND');
  return clientToRecord(row);
}

function mergeIntakeDataPatch(
  existing: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') {
      delete merged[k];
      continue;
    }
    if (k === 'noticeData' && typeof v === 'object' && !Array.isArray(v)) {
      const prev =
        merged.noticeData && typeof merged.noticeData === 'object' && !Array.isArray(merged.noticeData)
          ? (merged.noticeData as Record<string, unknown>)
          : {};
      merged.noticeData = { ...prev, ...(v as Record<string, unknown>) };
      continue;
    }
    if (k === 'notes' && typeof v === 'object' && !Array.isArray(v)) {
      const prev =
        merged.notes && typeof merged.notes === 'object' && !Array.isArray(merged.notes)
          ? (merged.notes as Record<string, unknown>)
          : {};
      const nextNotes = { ...prev, ...(v as Record<string, unknown>) };
      for (const [nk, nv] of Object.entries(nextNotes)) {
        if (nv === null || nv === undefined || nv === '') delete nextNotes[nk];
      }
      merged.notes = nextNotes;
      continue;
    }
    merged[k] = v;
  }
  return merged;
}

export async function getClientFeeChanges(clientId: string, limit = 50): Promise<ClientFeeChange[]> {
  const db = getDb();
  const client = await getClientById(clientId);
  const baselineRaw = client?.intakeData?.feeItemsBaselineAt;
  const baseline =
    typeof baselineRaw === 'string' && baselineRaw.trim()
      ? new Date(baselineRaw)
      : null;
  const baselineValid = baseline && !Number.isNaN(baseline.getTime());
  const hasFeeItems = readFeeItems(client?.intakeData).length > 0;

  // 엑셀 품목만 있고 기준일 없으면 구 이력 숨김 (엑셀 반영 = 최초)
  if (hasFeeItems && !baselineValid) {
    return [];
  }

  const conditions = [eq(clientFeeChanges.clientId, clientId)];
  if (baselineValid) {
    conditions.push(gt(clientFeeChanges.changedAt, baseline!));
  }

  const rows = await db
    .select({
      id: clientFeeChanges.id,
      previousFee: clientFeeChanges.previousFee,
      newFee: clientFeeChanges.newFee,
      changedAt: clientFeeChanges.changedAt,
      changedByName: users.name,
    })
    .from(clientFeeChanges)
    .innerJoin(users, eq(clientFeeChanges.changedByUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(clientFeeChanges.changedAt))
    .limit(limit);

  return rows.map(r => ({
    id: r.id,
    previousFee: r.previousFee ?? null,
    newFee: r.newFee ?? null,
    changedByName: r.changedByName,
    changedAt: r.changedAt.toISOString(),
  }));
}

export async function updateClientFeeSummary(
  id: string,
  feeSummary: number | null,
  changedByUserId: string,
) {
  const db = getDb();
  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  const previousFee = existing.feeSummary ?? null;
  if (previousFee === feeSummary) return existing;

  return db.transaction(async tx => {
    await tx.insert(clientFeeChanges).values({
      clientId: id,
      previousFee,
      newFee: feeSummary,
      changedByUserId,
    });

    const [row] = await tx
      .update(clients)
      .set({ feeSummary, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();

    if (!row) throw new Error('NOT_FOUND');
    return clientToRecord(row);
  });
}

export async function updateClientFeeItems(
  id: string,
  feeItems: FeeLineItem[],
  changedByUserId: string,
  opts?: { resetHistory?: boolean },
) {
  const db = getDb();
  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  const feeSummary = computeFeeSummaryFromItems(feeItems);
  const previousFee = existing.feeSummary ?? null;
  const prevItems = readFeeItems(existing.intakeData);
  const itemsChanged = !feeItemsEqual(prevItems, feeItems);

  if (!itemsChanged && previousFee === feeSummary && !opts?.resetHistory) return existing;

  const intakeData = {
    ...(existing.intakeData ?? {}),
    feeItems,
    bookkeepingFee: null,
    adjustmentFee: null,
    ...(opts?.resetHistory
      ? { feeItemsBaselineAt: new Date().toISOString() }
      : {}),
  };

  const logHistory = !opts?.resetHistory && (previousFee !== feeSummary || itemsChanged);

  return db.transaction(async tx => {
    if (opts?.resetHistory) {
      await tx.delete(clientFeeChanges).where(eq(clientFeeChanges.clientId, id));
    } else if (logHistory) {
      await tx.insert(clientFeeChanges).values({
        clientId: id,
        previousFee,
        newFee: feeSummary,
        changedByUserId,
      });
    }

    const [row] = await tx
      .update(clients)
      .set({ feeSummary, intakeData, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();

    if (!row) throw new Error('NOT_FOUND');
    return clientToRecord(row);
  });
}

/** @deprecated updateClientFeeItems 사용 */
export async function updateClientFeeBreakdown(
  id: string,
  data: { bookkeepingFee: number | null; adjustmentFee: number | null },
  changedByUserId: string,
) {
  const items: FeeLineItem[] = [];
  if (data.bookkeepingFee != null) items.push({ itemName: '기장수수료', supplyAmount: data.bookkeepingFee });
  if (data.adjustmentFee != null) items.push({ itemName: '조정료', supplyAmount: data.adjustmentFee });
  return updateClientFeeItems(id, items, changedByUserId);
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

  const existingRecord = await getChurnRecordForClient(id, existing.companyName);
  if (existingRecord) throw new Error('ALREADY_HAS_RECORD');

  const churnedAt = data.churnedAt?.trim()
    ? new Date(data.churnedAt.trim())
    : new Date();

  const reason = data.reason.trim();
  const detail = data.detail?.trim() ?? '';
  const earlySign = data.earlySign?.trim() ?? '';
  const clientHint: ChurnClientClosureHint = {
    intakeData: existing.intakeData,
    ntsStatusCode: existing.nts?.statusCode,
    ntsClosedDate: existing.nts?.closedDate,
  };
  const { dataCleanup, churnType } = normalizeChurnClosureFields(
    data.dataCleanup?.trim() ?? '',
    data.churnType?.trim() ?? '',
    { reason, detail, earlySign },
    clientHint,
  );

  await db.insert(churnRecords).values({
    clientId: id,
    companyName: existing.companyName,
    manager: data.manager?.trim() || existing.manager,
    reason,
    detail,
    churnType,
    dataCleanup,
    earlySign,
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

function clientClosureHintFromRow(row: {
  clientId: string | null;
  clientIntakeData?: Record<string, unknown> | null;
  clientNtsStatusCode?: string | null;
  clientNtsClosedDate?: string | null;
}): ChurnClientClosureHint | null {
  if (!row.clientId) return null;
  return {
    intakeData: row.clientIntakeData ?? undefined,
    ntsStatusCode: row.clientNtsStatusCode,
    ntsClosedDate: row.clientNtsClosedDate,
  };
}

function churnRecordRowToView(row: {
  id: string;
  clientId: string | null;
  companyName: string;
  manager: string;
  reason: string;
  detail: string;
  churnType: string;
  dataCleanup: string;
  earlySign: string;
  feeAmount: number | null;
  churnedAt: Date;
  recordedByName: string | null;
  clientIntakeData?: Record<string, unknown> | null;
  clientNtsStatusCode?: string | null;
  clientNtsClosedDate?: string | null;
}) {
  const { dataCleanup, churnType } = normalizeChurnClosureFields(
    row.dataCleanup,
    row.churnType,
    {
      reason: row.reason,
      detail: row.detail,
      earlySign: row.earlySign,
    },
    clientClosureHintFromRow(row),
  );
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: row.companyName,
    manager: row.manager,
    reason: row.reason,
    detail: row.detail,
    churnType,
    dataCleanup,
    earlySign: row.earlySign,
    feeAmount: row.feeAmount,
    churnedAt: row.churnedAt.toISOString(),
    recordedByName: row.recordedByName,
  };
}

const churnRecordSelect = {
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
  clientIntakeData: clients.intakeData,
  clientNtsStatusCode: clients.ntsStatusCode,
  clientNtsClosedDate: clients.ntsClosedDate,
};

export async function getChurnRecordByClientId(clientId: string) {
  const db = getDb();
  const [row] = await db
    .select(churnRecordSelect)
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .leftJoin(users, eq(churnRecords.recordedByUserId, users.id))
    .where(eq(churnRecords.clientId, clientId))
    .orderBy(desc(churnRecords.churnedAt))
    .limit(1);

  if (!row) return null;
  return churnRecordRowToView(row);
}

/** clientId로 연결된 유출 이력. 상호 동명은 다른 수임처일 수 있어 orphan(clientId 없음)만 상호 매칭 */
export async function getChurnRecordForClient(clientId: string, companyName: string) {
  const byId = await getChurnRecordByClientId(clientId);
  if (byId) return byId;

  const name = companyName.trim();
  if (!name) return null;

  const db = getDb();
  const [row] = await db
    .select(churnRecordSelect)
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .leftJoin(users, eq(churnRecords.recordedByUserId, users.id))
    .where(
      and(
        isNull(churnRecords.clientId),
        sql`trim(${churnRecords.companyName}) = ${name}`,
      ),
    )
    .orderBy(desc(churnRecords.churnedAt))
    .limit(1);

  if (!row) return null;
  return churnRecordRowToView(row);
}

export async function syncChurnClosureFromClients(): Promise<number> {
  const db = getDb();
  const companyKey = (name: string) =>
    name.trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase();

  const rows = await db
    .select({
      id: churnRecords.id,
      dataCleanup: churnRecords.dataCleanup,
      churnType: churnRecords.churnType,
      reason: churnRecords.reason,
      detail: churnRecords.detail,
      earlySign: churnRecords.earlySign,
      clientIntakeData: clients.intakeData,
      clientNtsStatusCode: clients.ntsStatusCode,
      clientNtsClosedDate: clients.ntsClosedDate,
    })
    .from(churnRecords)
    .innerJoin(clients, eq(churnRecords.clientId, clients.id));

  let updated = 0;
  for (const row of rows) {
    const clientHint: ChurnClientClosureHint = {
      intakeData: row.clientIntakeData,
      ntsStatusCode: row.clientNtsStatusCode,
      ntsClosedDate: row.clientNtsClosedDate,
    };
    const { dataCleanup, churnType } = normalizeChurnClosureFields(
      row.dataCleanup,
      row.churnType,
      { reason: row.reason, detail: row.detail, earlySign: row.earlySign },
      clientHint,
    );
    if (dataCleanup === row.dataCleanup && churnType === row.churnType) continue;
    await db
      .update(churnRecords)
      .set({ dataCleanup, churnType })
      .where(eq(churnRecords.id, row.id));
    updated += 1;
  }

  const closureClients = await db
    .select({
      companyName: clients.companyName,
      intakeData: clients.intakeData,
      ntsStatusCode: clients.ntsStatusCode,
      ntsClosedDate: clients.ntsClosedDate,
    })
    .from(clients);

  const closureByName = new Map<string, ChurnClientClosureHint>();
  for (const c of closureClients) {
    const hint: ChurnClientClosureHint = {
      intakeData: c.intakeData,
      ntsStatusCode: c.ntsStatusCode,
      ntsClosedDate: c.ntsClosedDate,
    };
    if (!clientIndicatesBusinessClosure(hint)) continue;
    const key = companyKey(c.companyName);
    if (key && !closureByName.has(key)) closureByName.set(key, hint);
  }

  if (closureByName.size > 0) {
    const orphans = await db
      .select({
        id: churnRecords.id,
        companyName: churnRecords.companyName,
        dataCleanup: churnRecords.dataCleanup,
        churnType: churnRecords.churnType,
        reason: churnRecords.reason,
        detail: churnRecords.detail,
        earlySign: churnRecords.earlySign,
      })
      .from(churnRecords)
      .where(isNull(churnRecords.clientId));

    for (const row of orphans) {
      const clientHint = closureByName.get(companyKey(row.companyName));
      if (!clientHint) continue;
      const { dataCleanup, churnType } = normalizeChurnClosureFields(
        row.dataCleanup,
        row.churnType,
        { reason: row.reason, detail: row.detail, earlySign: row.earlySign },
        clientHint,
      );
      if (dataCleanup === row.dataCleanup && churnType === row.churnType) continue;
      await db
        .update(churnRecords)
        .set({ dataCleanup, churnType })
        .where(eq(churnRecords.id, row.id));
      updated += 1;
    }
  }

  return updated;
}

export async function listChurnRecords(filters?: { mineOnly?: boolean; userId?: string; userName?: string }) {
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters?.mineOnly && filters.userId) {
    const mineCond = buildMineOnlyClientCondition(filters.userId, filters.userName ?? '');
    if (mineCond) conditions.push(mineCond);
  }

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
      clientIntakeData: clients.intakeData,
      clientNtsStatusCode: clients.ntsStatusCode,
      clientNtsClosedDate: clients.ntsClosedDate,
    })
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .leftJoin(users, eq(churnRecords.recordedByUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${churnRecords.churnedAt} desc`);

  return rows.map(r => churnRecordRowToView(r));
}

export async function listChurnedClientsWithoutRecord(filters?: { mineOnly?: boolean; userId?: string; userName?: string }) {
  const db = getDb();
  const conditions: SQL[] = [
    eq(clients.status, 'churned'),
    notExists(
      db
        .select({ id: churnRecords.id })
        .from(churnRecords)
        .where(
          or(
            eq(churnRecords.clientId, clients.id),
            sql`trim(${churnRecords.companyName}) = trim(${clients.companyName})`,
          ),
        ),
    ),
  ];
  if (filters?.mineOnly && filters.userId) {
    const mineCond = buildMineOnlyClientCondition(filters.userId, filters.userName ?? '');
    if (mineCond) conditions.push(mineCond);
  }

  const rows = await db
    .select({ client: clients })
    .from(clients)
    .where(and(...conditions))
    .orderBy(clients.companyName);

  return rows.map(r => clientToRecord(r.client));
}

export async function updateChurnRecord(
  id: string,
  data: {
    clientId?: string | null;
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
  const [existing] = await db.select().from(churnRecords).where(eq(churnRecords.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');

  let clientHint: ChurnClientClosureHint | null = null;
  const linkId = data.clientId !== undefined ? data.clientId : existing.clientId;
  if (linkId) {
    const [clientRow] = await db
      .select({
        intakeData: clients.intakeData,
        ntsStatusCode: clients.ntsStatusCode,
        ntsClosedDate: clients.ntsClosedDate,
      })
      .from(clients)
      .where(eq(clients.id, linkId))
      .limit(1);
    if (clientRow) {
      clientHint = {
        intakeData: clientRow.intakeData,
        ntsStatusCode: clientRow.ntsStatusCode,
        ntsClosedDate: clientRow.ntsClosedDate,
      };
    }
  }

  const patch: Record<string, unknown> = {};
  if (data.clientId !== undefined) patch.clientId = data.clientId;
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

  const reason = (patch.reason as string | undefined) ?? existing.reason;
  const detail = (patch.detail as string | undefined) ?? existing.detail;
  const earlySign = (patch.earlySign as string | undefined) ?? existing.earlySign;
  const { dataCleanup, churnType } = normalizeChurnClosureFields(
    (patch.dataCleanup as string | undefined) ?? existing.dataCleanup,
    (patch.churnType as string | undefined) ?? existing.churnType,
    { reason, detail, earlySign },
    clientHint,
  );
  patch.dataCleanup = dataCleanup;
  patch.churnType = churnType;

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
      clientIntakeData: clients.intakeData,
      clientNtsStatusCode: clients.ntsStatusCode,
      clientNtsClosedDate: clients.ntsClosedDate,
    })
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .leftJoin(users, eq(churnRecords.recordedByUserId, users.id))
    .where(eq(churnRecords.id, id))
    .limit(1);

  const r = full[0];
  return churnRecordRowToView(r);
}

export async function getChurnRecordById(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: churnRecords.id,
      clientId: churnRecords.clientId,
      manager: sql<string>`coalesce(${clients.manager}, ${churnRecords.manager})`,
      assignedUserId: clients.assignedUserId,
    })
    .from(churnRecords)
    .leftJoin(clients, eq(churnRecords.clientId, clients.id))
    .where(eq(churnRecords.id, id))
    .limit(1);
  return row ?? null;
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

/** 동일 사업자번호·식별번호 쌍 수임처 조회 — 중복 확인용 */
export async function findClientsByBusinessNo(
  businessNo: string,
  opts?: {
    corporateNo?: string;
    residentNo?: string;
    businessEntityType?: string;
    category?: string;
  },
) {
  const digits = String(businessNo || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length !== 10) return [];

  const isCorporate =
    opts?.businessEntityType === 'corporate' || opts?.category === '법인';
  const corpDigits = String(opts?.corporateNo ?? '').replace(/\D/g, '').slice(0, 13);
  const resDigits = String(opts?.residentNo ?? '').replace(/\D/g, '').slice(0, 13);

  const db = getDb();
  if (isCorporate) {
    if (corpDigits.length !== 13) return [];
    const rows = await db
      .select()
      .from(clients)
      .where(
        sql`regexp_replace(${clients.businessNo}, '[^0-9]', '', 'g') = ${digits}
          AND regexp_replace(${clients.corporateNo}, '[^0-9]', '', 'g') = ${corpDigits}`,
      )
      .orderBy(asc(clients.createdAt));
    return rows.map(clientToListRecord);
  }

  if (resDigits.length !== 13) return [];
  const rows = await db
    .select()
    .from(clients)
    .where(
      sql`regexp_replace(${clients.businessNo}, '[^0-9]', '', 'g') = ${digits}
        AND regexp_replace(${clients.residentNo}, '[^0-9]', '', 'g') = ${resDigits}`,
    )
    .orderBy(asc(clients.createdAt));
  return rows.map(clientToListRecord);
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
