import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { intakeInquiries, intakeProcesses, clients } from '@/db/schema';
import { CHECKLIST_KEYS } from '@/app/types/intake';
import { companyMatchKeys, normalizeCompanyKey } from '@/app/components/intake/intakeUtils';

export type DashboardTask = {
  id: string;
  type: 'consultation_draft' | 'onboarding_incomplete';
  title: string;
  subtitle?: string;
  href: string;
  priority: number;
};

function checklistDoneCount(checklist: Record<string, boolean> | null | undefined): number {
  const c = checklist ?? {};
  return CHECKLIST_KEYS.filter(k => Boolean(c[k])).length;
}

export async function listDashboardTasks(userName: string, limit = 20): Promise<DashboardTask[]> {
  const db = getDb();
  const tasks: DashboardTask[] = [];
  const total = CHECKLIST_KEYS.length;

  const drafts = await db.select().from(intakeInquiries)
    .where(and(
      eq(intakeInquiries.consultant, userName),
      sql`(${intakeInquiries.extra}->>'draft') = 'true'`,
    ))
    .orderBy(desc(intakeInquiries.createdAt))
    .limit(5);

  for (const d of drafts) {
    tasks.push({
      id: `draft-${d.id}`,
      type: 'consultation_draft',
      title: '상담 초안',
      subtitle: '이어서 작성',
      href: `/clients/intake?tab=consultation&draft=${d.id}`,
      priority: 1,
    });
  }

  const inquiryRows = await db
    .select({ id: intakeInquiries.id, companyName: intakeInquiries.companyName })
    .from(intakeInquiries)
    .where(sql`coalesce(${intakeInquiries.extra}->>'draft', '') != 'true'`);

  const inquiryIdByKey = new Map<string, string>();
  for (const row of inquiryRows) {
    for (const key of companyMatchKeys(row.companyName)) {
      if (!inquiryIdByKey.has(key)) inquiryIdByKey.set(key, row.id);
    }
  }

  const processes = await db
    .select({
      id: intakeProcesses.id,
      companyName: intakeProcesses.companyName,
      checklist: intakeProcesses.checklist,
      clientCompanyName: clients.companyName,
    })
    .from(intakeProcesses)
    .leftJoin(clients, eq(clients.id, intakeProcesses.clientId))
    .orderBy(desc(intakeProcesses.updatedAt))
    .limit(40);

  for (const p of processes) {
    const done = checklistDoneCount(p.checklist as Record<string, boolean>);
    if (done >= total) continue;

    const company = (p.clientCompanyName || p.companyName || '업체명 미정').trim();
    const companyKeys = [
      normalizeCompanyKey(company),
      ...companyMatchKeys(company),
      ...companyMatchKeys(p.companyName),
    ].filter(Boolean);
    const inquiryId = companyKeys.map(k => inquiryIdByKey.get(k)).find(Boolean);

    tasks.push({
      id: `onboard-${p.id}`,
      type: 'onboarding_incomplete',
      title: `${company} - 프로세스 (${done}/${total})`,
      href: inquiryId
        ? `/clients/intake?tab=intake&inquiry=${inquiryId}`
        : `/clients/intake?tab=intake&processId=${p.id}&q=${encodeURIComponent(company)}`,
      priority: 2,
    });
  }

  tasks.sort((a, b) => a.priority - b.priority);
  return tasks.slice(0, limit);
}
