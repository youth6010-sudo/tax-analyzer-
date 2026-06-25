import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { intakeInquiries, intakeProcesses, clients } from '@/db/schema';
import { CHECKLIST_KEYS } from '@/app/types/intake';
import {
  buildIntakeDeepLink,
  findInquiryForProcess,
  type ClientNameRef,
  type InquiryRow,
  type ProcessRow,
} from '@/app/components/intake/intakeUtils';

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

function toInquiryRow(row: {
  id: string;
  clientId: string | null;
  companyName: string;
  phone: string;
  channel: string;
  consultant: string;
  inquiryDate: string;
  inquiryContent: string;
  contractStatus: string;
  proposedFee: number | null;
  industry: string;
  businessNo: string;
  representative: string;
  address: string;
  extra: Record<string, unknown>;
  excelKey: string;
  createdAt: Date;
}): InquiryRow {
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: row.companyName,
    phone: row.phone,
    channel: row.channel,
    consultant: row.consultant,
    inquiryDate: row.inquiryDate,
    inquiryContent: row.inquiryContent,
    contractStatus: row.contractStatus,
    proposedFee: row.proposedFee,
    industry: row.industry,
    businessNo: row.businessNo,
    representative: row.representative,
    address: row.address,
    extra: row.extra ?? {},
    createdAt: row.createdAt.toISOString(),
    excelKey: row.excelKey,
  };
}

function toProcessRow(row: {
  id: string;
  clientId: string | null;
  companyName: string;
  feeStartDate: string;
  monthlyFee: number | null;
  channel: string;
  checklist: Record<string, boolean>;
  excelKey: string;
  updatedAt: Date;
  clientCompanyName: string | null;
}): ProcessRow {
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: row.companyName,
    feeStartDate: row.feeStartDate,
    monthlyFee: row.monthlyFee,
    channel: row.channel,
    checklist: row.checklist ?? {},
    excelKey: row.excelKey,
    updatedAt: row.updatedAt.toISOString(),
  };
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
    .select({
      id: intakeInquiries.id,
      clientId: intakeInquiries.clientId,
      companyName: intakeInquiries.companyName,
      phone: intakeInquiries.phone,
      channel: intakeInquiries.channel,
      consultant: intakeInquiries.consultant,
      inquiryDate: intakeInquiries.inquiryDate,
      inquiryContent: intakeInquiries.inquiryContent,
      contractStatus: intakeInquiries.contractStatus,
      proposedFee: intakeInquiries.proposedFee,
      industry: intakeInquiries.industry,
      businessNo: intakeInquiries.businessNo,
      representative: intakeInquiries.representative,
      address: intakeInquiries.address,
      extra: intakeInquiries.extra,
      excelKey: intakeInquiries.excelKey,
      createdAt: intakeInquiries.createdAt,
    })
    .from(intakeInquiries)
    .where(sql`coalesce(${intakeInquiries.extra}->>'draft', '') != 'true'`);

  const inquiries = inquiryRows.map(toInquiryRow);

  const clientRows = await db
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients);
  const clientRefs: ClientNameRef[] = clientRows.map(c => ({
    id: c.id,
    companyName: c.companyName,
  }));

  const processRows = await db
    .select({
      id: intakeProcesses.id,
      clientId: intakeProcesses.clientId,
      companyName: intakeProcesses.companyName,
      feeStartDate: intakeProcesses.feeStartDate,
      monthlyFee: intakeProcesses.monthlyFee,
      channel: intakeProcesses.channel,
      checklist: intakeProcesses.checklist,
      excelKey: intakeProcesses.excelKey,
      updatedAt: intakeProcesses.updatedAt,
      clientCompanyName: clients.companyName,
    })
    .from(intakeProcesses)
    .leftJoin(clients, eq(clients.id, intakeProcesses.clientId))
    .orderBy(desc(intakeProcesses.updatedAt))
    .limit(100);

  for (const raw of processRows) {
    const process = toProcessRow(raw);
    const done = checklistDoneCount(process.checklist as Record<string, boolean>);
    if (done >= total) continue;

    const company = (raw.clientCompanyName?.trim() || raw.companyName.trim() || '업체명 미정');
    const altNames = [raw.clientCompanyName, raw.companyName].filter(
      (n): n is string => Boolean(n?.trim()),
    );
    const inquiry = findInquiryForProcess(process, inquiries, altNames, clientRefs);

    tasks.push({
      id: `onboard-${process.id}`,
      type: 'onboarding_incomplete',
      title: `${company} - 프로세스 (${done}/${total})`,
      href: buildIntakeDeepLink({
        inquiryId: inquiry?.id,
        processId: process.id,
        companyName: company,
      }),
      priority: 2,
    });
  }

  tasks.sort((a, b) => a.priority - b.priority);
  return tasks.slice(0, limit);
}
