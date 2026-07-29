import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, intakeInquiries, users } from '@/db/schema';
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

/** 수임처 manager + assignedUserId 갱신 */
export async function applyManagerToClient(clientId: string, managerName: string): Promise<void> {
  const mgr = managerName.trim();
  const db = getDb();
  const assignedUserId = mgr ? await findAssignedUserId(mgr) : null;
  await db
    .update(clients)
    .set({
      manager: mgr,
      assignedUserId,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));
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
