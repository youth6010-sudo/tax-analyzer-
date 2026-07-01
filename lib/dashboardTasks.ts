import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { intakeInquiries, intakeProcesses, clients } from '@/db/schema';
import { CHECKLIST_KEYS } from '@/app/types/intake';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import {
  buildIntakeDeepLink,
  findInquiryForProcess,
  resolveClientIdByName,
  type ClientNameRef,
  type InquiryRow,
  type ProcessRow,
} from '@/app/components/intake/intakeUtils';

export type DashboardTask = {
  id: string;
  type: 'consultation_draft' | 'onboarding_incomplete' | 'nts_alert';
  title: string;
  subtitle?: string;
  href: string;
  priority: number;
};

export type DashboardTaskUser = {
  name: string;
  isAdmin: boolean;
};

/**
 * 담당자 기준 노출 규칙:
 *  - 담당자가 지정된 업체 → 그 담당자에게만
 *  - 담당자가 없는 업체 → 관리자에게만
 */
function visibleToUser(manager: string, user: DashboardTaskUser): boolean {
  const mgr = (manager || '').trim();
  if (mgr) return getManagerMatchNames(user.name).includes(mgr);
  return user.isAdmin;
}

function checklistVisibleKeys(checklist: Record<string, unknown> | null | undefined): string[] {
  const hidden = Array.isArray(checklist?._hidden) ? (checklist._hidden as string[]) : [];
  return CHECKLIST_KEYS.filter(k => !hidden.includes(k));
}

function checklistDoneCount(checklist: Record<string, boolean> | null | undefined): number {
  const c = checklist ?? {};
  return checklistVisibleKeys(c).filter(k => Boolean(c[k])).length;
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

export async function listDashboardTasks(
  user: DashboardTaskUser,
  limit = 20,
): Promise<DashboardTask[]> {
  const db = getDb();
  const tasks: DashboardTask[] = [];
  const userName = user.name;

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
    .select({ id: clients.id, companyName: clients.companyName, manager: clients.manager })
    .from(clients);
  const clientRefs: ClientNameRef[] = clientRows.map(c => ({
    id: c.id,
    companyName: c.companyName,
  }));
  const managerByClientId = new Map<string, string>();
  for (const c of clientRows) managerByClientId.set(c.id, c.manager || '');

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
      clientManager: clients.manager,
    })
    .from(intakeProcesses)
    .leftJoin(clients, eq(clients.id, intakeProcesses.clientId))
    .orderBy(desc(intakeProcesses.updatedAt))
    .limit(100);

  for (const raw of processRows) {
    const process = toProcessRow(raw);
    const visibleTotal = checklistVisibleKeys(process.checklist as Record<string, boolean>).length;
    const done = checklistDoneCount(process.checklist as Record<string, boolean>);
    if (visibleTotal === 0 || done >= visibleTotal) continue;

    // 담당자: 연결된 수임처(clientId) → 없으면 상호로 매칭한 수임처
    const resolvedClientId =
      raw.clientId ?? resolveClientIdByName(raw.companyName, clientRefs, raw.excelKey ?? undefined);
    // 유입 프로세스 할 일 — 찰리(관리자)에게만
    if (!user.isAdmin) continue;

    const company = (raw.clientCompanyName?.trim() || raw.companyName.trim() || '업체명 미정');
    const manager = (raw.clientManager ?? (resolvedClientId ? managerByClientId.get(resolvedClientId) : '') ?? '').trim();
    const altNames = [raw.clientCompanyName, raw.companyName].filter(
      (n): n is string => Boolean(n?.trim()),
    );
    const inquiry = findInquiryForProcess(process, inquiries, altNames, clientRefs);

    tasks.push({
      id: `onboard-${process.id}`,
      type: 'onboarding_incomplete',
      title: `${company} - 프로세스 (${done}/${visibleTotal})`,
      subtitle: manager ? undefined : '담당 미지정',
      href: buildIntakeDeepLink({
        inquiryId: inquiry?.id,
        processId: process.id,
        companyName: company,
      }),
      priority: 2,
    });
  }

  // 국세청 사업자상태 폐업(03)·휴업(02) 업체 → 담당자(없으면 관리자) 할 일
  const ntsRows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      manager: clients.manager,
      ntsStatus: clients.ntsStatus,
      ntsStatusCode: clients.ntsStatusCode,
    })
    .from(clients)
    .where(and(
      ne(clients.status, 'churned'),
      inArray(clients.ntsStatusCode, ['02', '03']),
    ));

  for (const c of ntsRows) {
    const manager = (c.manager || '').trim();
    if (!visibleToUser(manager, user)) continue;
    const label = c.ntsStatusCode === '03' ? '폐업' : '휴업';
    tasks.push({
      id: `nts-${c.id}`,
      type: 'nts_alert',
      title: `${c.companyName || '업체명 미정'} - ${label} 확인`,
      subtitle: manager ? '국세청 상태' : '담당 미지정 · 국세청',
      href: `/clients/${c.id}`,
      priority: 0,
    });
  }

  tasks.sort((a, b) => a.priority - b.priority);
  return tasks.slice(0, limit);
}
