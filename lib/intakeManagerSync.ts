import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { recordClientManagerChange } from '@/lib/clientManagerHistoryDb';
import { arrearsEntries, clients, intakeInquiries, users } from '@/db/schema';
import { getManagerMatchNames, managerNamesMatch } from '@/app/utils/managerMatch';

export {
  assertCanChangeAssignedManager,
  canChangeAssignedManager,
  nextManagerAfterChange,
  resolveLinkedManager,
  type ManagerActor,
} from '@/lib/intakeManagerGate';

async function findAssignedUserId(managerName: string): Promise<string | null> {
  const names = getManagerMatchNames(managerName);
  if (!names.length) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.name, names))
    .limit(1);
  return row?.id ?? null;
}

/** 수임처 manager + assignedUserId 갱신 (+ 연결 미수 담당 동기화) */
export async function applyManagerToClient(clientId: string, managerName: string): Promise<void> {
  const mgr = managerName.trim();
  const db = getDb();
  const [existing] = await db
    .select({
      manager: clients.manager,
      companyName: clients.companyName,
      intakeData: clients.intakeData,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!existing) return;
  const prev = (existing.manager ?? '').trim();
  const assignedUserId = mgr ? await findAssignedUserId(mgr) : null;
  await db
    .update(clients)
    .set({
      manager: mgr,
      assignedUserId,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));
  if (prev !== mgr) {
    await recordClientManagerChange({
      clientId,
      previousManager: prev,
      newManager: mgr,
    });
  }
  const douzoneCode =
    existing.intakeData && typeof existing.intakeData === 'object'
      ? String((existing.intakeData as Record<string, unknown>).douzoneCode ?? '').trim()
      : '';
  await applyManagerToLinkedArrears(clientId, mgr, {
    douzoneCode,
    companyName: existing.companyName || '',
  });
}

/**
 * 수임처 담당 변경 → 연결 미수 entry 담당 동기화
 * (clientId 연결 + 세무사랑 코드/상호 매칭)
 */
export async function applyManagerToLinkedArrears(
  clientId: string,
  managerName: string,
  opts?: { douzoneCode?: string; companyName?: string },
): Promise<void> {
  const mgr = managerName.trim();
  const db = getDb();
  const now = new Date();
  const code = (opts?.douzoneCode || '').trim();
  const name = (opts?.companyName || '').trim();

  await db
    .update(arrearsEntries)
    .set({ managerName: mgr, updatedAt: now, clientId })
    .where(eq(arrearsEntries.clientId, clientId));

  if (code) {
    await db
      .update(arrearsEntries)
      .set({ managerName: mgr, updatedAt: now, clientId })
      .where(eq(arrearsEntries.externalCode, code));
  }

  if (name) {
    const compact = name.replace(/\s+/g, '').toLowerCase();
    if (compact) {
      await db
        .update(arrearsEntries)
        .set({ managerName: mgr, updatedAt: now, clientId })
        .where(sql`lower(replace(${arrearsEntries.companyName}, ' ', '')) = ${compact}`);
    }
  }
}

/** 미수 entry → 연결 수임처 id 찾기 */
export async function resolveClientIdForArrearsEntry(entry: {
  clientId?: string | null;
  externalCode?: string | null;
  companyName?: string | null;
}): Promise<string | null> {
  if (entry.clientId?.trim()) return entry.clientId.trim();
  const db = getDb();
  const code = (entry.externalCode || '').trim();
  if (code) {
    const [byCode] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(sql`coalesce(${clients.intakeData}->>'douzoneCode','') = ${code}`)
      .limit(1);
    if (byCode?.id) return byCode.id;
  }
  const name = (entry.companyName || '').trim();
  if (name) {
    const compact = name.replace(/\s+/g, '').toLowerCase();
    const [byName] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(sql`lower(replace(${clients.companyName}, ' ', '')) = ${compact}`)
      .limit(1);
    if (byName?.id) return byName.id;
  }
  return null;
}

/**
 * 미수 담당 변경 → 수임처 담당 동기화.
 * applyManagerToClient를 쓰면 다시 미수로 돌아오므로, 수임처만 직접 갱신한다.
 */
export async function applyArrearsManagerToClient(
  entry: {
    clientId?: string | null;
    externalCode?: string | null;
    companyName?: string | null;
  },
  managerName: string,
): Promise<string | null> {
  const clientId = await resolveClientIdForArrearsEntry(entry);
  if (!clientId) return null;

  const mgr = managerName.trim();
  const db = getDb();
  const [existing] = await db
    .select({ manager: clients.manager })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!existing) return clientId;

  const prev = (existing.manager ?? '').trim();
  if (prev === mgr) {
    // clientId만 미수에 연결
    if (!entry.clientId) {
      /* patched by caller */
    }
    return clientId;
  }

  const assignedUserId = mgr ? await findAssignedUserId(mgr) : null;
  await db
    .update(clients)
    .set({
      manager: mgr,
      assignedUserId,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));
  await recordClientManagerChange({
    clientId,
    previousManager: prev,
    newManager: mgr,
  });
  await applyManagerToLinkedInquiries(clientId, mgr);
  return clientId;
}

/** 연결된 유입문의 assigneeManager 갱신 */
export async function applyManagerToLinkedInquiries(
  clientId: string,
  managerName: string,
): Promise<void> {
  const mgr = managerName.trim();
  const db = getDb();
  const rows = await db
    .select({ id: intakeInquiries.id, extra: intakeInquiries.extra })
    .from(intakeInquiries)
    .where(eq(intakeInquiries.clientId, clientId));

  for (const row of rows) {
    const prev = typeof row.extra?.assigneeManager === 'string' ? row.extra.assigneeManager.trim() : '';
    if (managerNamesMatch(prev, mgr) && prev === mgr) continue;
    await db
      .update(intakeInquiries)
      .set({ extra: { ...(row.extra ?? {}), assigneeManager: mgr } })
      .where(eq(intakeInquiries.id, row.id));
  }
}

/** 문의 extra.assigneeManager만 갱신 */
export async function applyAssigneeToInquiry(
  inquiryId: string,
  managerName: string,
): Promise<void> {
  const mgr = managerName.trim();
  const db = getDb();
  const [row] = await db
    .select({ extra: intakeInquiries.extra })
    .from(intakeInquiries)
    .where(eq(intakeInquiries.id, inquiryId))
    .limit(1);
  if (!row) return;
  await db
    .update(intakeInquiries)
    .set({ extra: { ...(row.extra ?? {}), assigneeManager: mgr } })
    .where(eq(intakeInquiries.id, inquiryId));
}
