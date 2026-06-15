import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { intakeInquiries, intakeProcesses } from '@/db/schema';
import { CHECKLIST_KEYS } from '@/app/types/intake';

export type DashboardTask = {
  id: string;
  type: 'consultation_draft' | 'onboarding_incomplete' | 'bluehole_unlinked';
  title: string;
  subtitle?: string;
  href: string;
  priority: number;
};

function inquiryBlueholeCase(extra: Record<string, unknown> | undefined): string {
  return typeof extra?.blueholeCase === 'string' ? extra.blueholeCase : '';
}

export async function listDashboardTasks(userName: string, limit = 20): Promise<DashboardTask[]> {
  const db = getDb();
  const tasks: DashboardTask[] = [];

  const drafts = await db.select().from(intakeInquiries)
    .where(and(
      eq(intakeInquiries.consultant, userName),
      sql`(${intakeInquiries.extra}->>'draft') = 'true'`,
    ))
    .orderBy(desc(intakeInquiries.createdAt))
    .limit(5);

  for (const d of drafts) {
    const extra = d.extra ?? {};
    const form = (extra.form && typeof extra.form === 'object' ? extra.form : {}) as Record<string, unknown>;
    const name = String(form.companyName ?? d.companyName);
    tasks.push({
      id: `draft-${d.id}`,
      type: 'consultation_draft',
      title: `상담 초안: ${name || '(상호 미입력)'}`,
      subtitle: '이어서 작성',
      href: `/clients/intake?tab=consultation&draft=${d.id}`,
      priority: 1,
    });
  }

  const processes = await db.select().from(intakeProcesses)
    .orderBy(desc(intakeProcesses.updatedAt))
    .limit(100);

  for (const p of processes) {
    const checklist = p.checklist ?? {};
    const done = CHECKLIST_KEYS.filter(k => Boolean((checklist as Record<string, boolean>)[k])).length;
    if (done >= CHECKLIST_KEYS.length) continue;

    const missing = CHECKLIST_KEYS.filter(k => !(checklist as Record<string, boolean>)[k]);
    tasks.push({
      id: `onboard-${p.id}`,
      type: 'onboarding_incomplete',
      title: `온보딩 미완료: ${p.companyName}`,
      subtitle: `${done}/${CHECKLIST_KEYS.length} · ${missing.slice(0, 2).join(', ')}…`,
      href: `/clients/intake?tab=intake&q=${encodeURIComponent(p.companyName)}`,
      priority: 2,
    });
  }

  const inquiries = await db.select().from(intakeInquiries)
    .where(sql`(${intakeInquiries.extra}->>'draft') IS DISTINCT FROM 'true'`)
    .orderBy(desc(intakeInquiries.createdAt))
    .limit(50);

  for (const inq of inquiries) {
    const bh = inquiryBlueholeCase(inq.extra);
    if (bh.trim()) continue;
    if (!inq.companyName.trim() || inq.companyName === '(미입력)') continue;
    tasks.push({
      id: `bh-${inq.id}`,
      type: 'bluehole_unlinked',
      title: `블루홀 미연결: ${inq.companyName}`,
      subtitle: '업체 번호 입력',
      href: `/clients/intake?tab=intake&inquiry=${inq.id}`,
      priority: 3,
    });
  }

  tasks.sort((a, b) => a.priority - b.priority);
  return tasks.slice(0, limit);
}
