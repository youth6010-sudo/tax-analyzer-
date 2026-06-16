import { randomUUID } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, intakeInquiries, intakeProcesses } from '@/db/schema';
import { CHECKLIST_KEYS, BLUEHOLE_CODE_KEY } from '@/app/types/intake';
import type { ChecklistKey } from '@/app/types/intake';
import type { ProcessChecklist } from '@/app/types/externalRefs';
import { applyChecklistMeta } from '@/lib/checklistMeta';
import { clientToRecord } from '@/lib/clientMapper';
import {
  externalRefsFromInquiryExtra,
  intakeDataWithExternalRefs,
  mergeExternalRefs,
  parseExternalRefs,
} from '@/lib/externalRefs';

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

const ENTITY_MAP: Record<string, string> = {
  개인: 'individual',
  법인: 'corporate',
  프리랜서: 'individual',
  면세: 'nonBusiness',
};

export function buildInquiryContent(data: Record<string, unknown>): string {
  const sections: { title: string; keys: [string, string][] }[] = [
    {
      title: '[전화] 기본',
      keys: [
        ['계기', 'channel'], ['계기 상세', 'channelDetail'], ['매출', 'revenue'],
        ['이전 세무사', 'hasPrevAccountant'],
      ],
    },
    {
      title: '[전화] 이전 세무사',
      keys: [
        ['해지', 'prevTerminated'], ['자료 반환', 'prevDocsReturned'],
        ['미수금·분쟁', 'prevUnpaidIssues'], ['불만', 'prevComplaints'],
      ],
    },
    {
      title: '[전화] 일정',
      keys: [
        ['대면 필요', 'needMeeting'], ['예정일', 'meetingDate'],
        ['장소', 'meetingPlace'], ['준비자료', 'docsToBring'],
      ],
    },
    {
      title: '[대면] 니즈',
      keys: [
        ['불편·걱정', 'needPain'], ['기대 역할', 'needExpectation'],
        ['기대 상세', 'needExpectationDetail'], ['아쉬운 경험', 'needPastExperience'],
      ],
    },
    {
      title: '[대면] 진단',
      keys: [
        ['매출 추이', 'diagRevenueTrend'], ['비용', 'diagCostStructure'],
        ['인건비·4대', 'payrollStatus'], ['신고 상태', 'diagFilingStatus'],
        ['리스크', 'diagTaxRisks'],
      ],
    },
    {
      title: '[대면] 서비스·수임료',
      keys: [
        ['기본', 'serviceBasic'], ['추가', 'serviceExtra'], ['안내 멘트', 'feeGuidanceNote'],
      ],
    },
    {
      title: '[마무리]',
      keys: [
        ['핵심 니즈', 'coreNeeds'], ['요약', 'recordSummary'],
        ['서비스 범위', 'agreedServiceScope'], ['후속', 'followUpNotes'],
      ],
    },
  ];

  const lines: string[] = [];
  for (const { title, keys } of sections) {
    const part: string[] = [];
    for (const [label, key] of keys) {
      const v = str(data[key]);
      if (v) part.push(`${label}: ${v}`);
    }
    if (part.length) {
      lines.push(title);
      lines.push(...part);
      lines.push('');
    }
  }
  return lines.join('\n').trim();
}

function emptyChecklist() {
  return Object.fromEntries(CHECKLIST_KEYS.map(k => [k, false])) as Record<string, boolean>;
}

function draftCompanyName(data: Record<string, unknown>): string {
  return str(data.companyName) || '(작성 중)';
}

function isDraftRow(extra: Record<string, unknown> | null | undefined): boolean {
  return extra?.draft === true;
}

export type ConsultationDraftSummary = {
  id: string;
  companyName: string;
  consultant: string;
  stepIdx: number;
  stepTitle: string;
  updatedAt: string;
  createdAt: string;
};

export async function listConsultationDrafts(consultantName: string): Promise<ConsultationDraftSummary[]> {
  const db = getDb();
  const rows = await db.select().from(intakeInquiries)
    .where(and(
      eq(intakeInquiries.consultant, consultantName),
      sql`(${intakeInquiries.extra}->>'draft') = 'true'`,
    ))
    .orderBy(desc(intakeInquiries.createdAt));

  return rows.map(row => {
    const extra = row.extra ?? {};
    const form = (extra.form && typeof extra.form === 'object' ? extra.form : {}) as Record<string, unknown>;
    const stepIdx = typeof extra.stepIdx === 'number' ? extra.stepIdx : 0;
    return {
      id: row.id,
      companyName: str(form.companyName) || row.companyName,
      consultant: row.consultant,
      stepIdx,
      stepTitle: str(extra.stepTitle) || `단계 ${stepIdx + 1}`,
      updatedAt: str(extra.updatedAt) || row.createdAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function getConsultationDraft(id: string, consultantName: string) {
  const db = getDb();
  const [row] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, id)).limit(1);
  if (!row || !isDraftRow(row.extra) || row.consultant !== consultantName) {
    throw new Error('NOT_FOUND');
  }
  const extra = row.extra ?? {};
  const form = (extra.form && typeof extra.form === 'object' ? extra.form : {}) as Record<string, string>;
  const stepIdx = typeof extra.stepIdx === 'number' ? extra.stepIdx : 0;
  return { id: row.id, form, stepIdx };
}

export async function saveConsultationDraft(
  data: Record<string, unknown>,
  stepIdx: number,
  consultantName: string,
  inquiryId?: string | null,
  stepTitle?: string,
) {
  const db = getDb();
  const companyName = draftCompanyName(data);
  const extra = {
    draft: true,
    form: data,
    stepIdx,
    stepTitle: stepTitle ?? '',
    manualVersion: 'v0.1',
    updatedAt: new Date().toISOString(),
  };

  if (inquiryId) {
    const [existing] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, inquiryId)).limit(1);
    if (!existing || !isDraftRow(existing.extra) || existing.consultant !== consultantName) {
      throw new Error('NOT_FOUND');
    }
    const [row] = await db.update(intakeInquiries)
      .set({
        companyName,
        phone: str(data.phone),
        channel: [str(data.channel), str(data.channelDetail)].filter(Boolean).join(' · '),
        inquiryContent: buildInquiryContent(data) || '(작성 중)',
        proposedFee: typeof data.proposedFee === 'number' ? data.proposedFee : null,
        industry: str(data.industry),
        businessNo: str(data.businessNo),
        representative: str(data.representative),
        address: str(data.location),
        extra: { ...(existing.extra ?? {}), ...extra },
      })
      .where(eq(intakeInquiries.id, inquiryId))
      .returning();
    return row!;
  }

  const draftId = randomUUID();
  const [row] = await db.insert(intakeInquiries).values({
    companyName,
    phone: str(data.phone),
    channel: [str(data.channel), str(data.channelDetail)].filter(Boolean).join(' · '),
    consultant: consultantName,
    inquiryDate: new Date().toISOString().slice(0, 10),
    inquiryContent: buildInquiryContent(data) || '(작성 중)',
    proposedFee: typeof data.proposedFee === 'number' ? data.proposedFee : null,
    industry: str(data.industry),
    businessNo: str(data.businessNo),
    representative: str(data.representative),
    address: str(data.location),
    extra,
    excelKey: `portal||draft||${draftId}`,
  }).returning();
  return row!;
}

export async function deleteConsultationDraft(id: string, consultantName: string) {
  const db = getDb();
  const [existing] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, id)).limit(1);
  if (!existing || !isDraftRow(existing.extra) || existing.consultant !== consultantName) {
    throw new Error('NOT_FOUND');
  }
  await db.delete(intakeInquiries).where(eq(intakeInquiries.id, id));
}

export async function createConsultation(
  data: Record<string, unknown>,
  consultantName: string,
  options?: { draftId?: string | null },
) {
  const companyName = str(data.companyName);
  if (!companyName) throw new Error('COMPANY_NAME_REQUIRED');

  const consultId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const db = getDb();
  const entityRaw = str(data.businessEntityType);

  if (options?.draftId) {
    const [draft] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, options.draftId)).limit(1);
    if (!draft || !isDraftRow(draft.extra) || draft.consultant !== consultantName) {
      throw new Error('DRAFT_NOT_FOUND');
    }

    const [inquiry] = await db.update(intakeInquiries)
      .set({
        companyName,
        phone: str(data.phone),
        channel: [str(data.channel), str(data.channelDetail)].filter(Boolean).join(' · '),
        consultant: consultantName,
        inquiryDate: str(data.recordMeetingAt) || today,
        inquiryContent: buildInquiryContent(data),
        proposedFee: typeof data.proposedFee === 'number' ? data.proposedFee : null,
        industry: str(data.industry),
        businessNo: str(data.businessNo),
        representative: str(data.representative),
        address: str(data.location),
        extra: { consultationId: consultId, form: data, manualVersion: 'v0.1' },
        excelKey: `portal||consult||${consultId}||inquiry`,
      })
      .where(eq(intakeInquiries.id, options.draftId))
      .returning();

    const [process] = await db.insert(intakeProcesses).values({
      companyName,
      channel: str(data.channel),
      monthlyFee: typeof data.proposedFee === 'number' ? data.proposedFee : null,
      checklist: emptyChecklist(),
      excelKey: `portal||consult||${consultId}||process`,
    }).returning();

    return { consultId, inquiry, process, businessEntityType: ENTITY_MAP[entityRaw] ?? '' };
  }

  const [inquiry] = await db.insert(intakeInquiries).values({
    companyName,
    phone: str(data.phone),
    channel: [str(data.channel), str(data.channelDetail)].filter(Boolean).join(' · '),
    consultant: consultantName,
    inquiryDate: str(data.recordMeetingAt) || today,
    inquiryContent: buildInquiryContent(data),
    proposedFee: typeof data.proposedFee === 'number' ? data.proposedFee : null,
    industry: str(data.industry),
    businessNo: str(data.businessNo),
    representative: str(data.representative),
    address: str(data.location),
    extra: { consultationId: consultId, form: data, manualVersion: 'v0.1' },
    excelKey: `portal||consult||${consultId}||inquiry`,
  }).returning();

  const [process] = await db.insert(intakeProcesses).values({
    companyName,
    channel: str(data.channel),
    monthlyFee: typeof data.proposedFee === 'number' ? data.proposedFee : null,
    checklist: emptyChecklist(),
    excelKey: `portal||consult||${consultId}||process`,
  }).returning();

  return { consultId, inquiry, process, businessEntityType: ENTITY_MAP[entityRaw] ?? '' };
}

export async function createIntakeProcess(data: {
  companyName: string;
  clientId?: string | null;
  feeStartDate?: string;
  monthlyFee?: number | null;
  channel?: string;
}) {
  const companyName = data.companyName.trim() || '(미입력)';

  const db = getDb();
  const [row] = await db.insert(intakeProcesses).values({
    companyName,
    clientId: data.clientId ?? null,
    feeStartDate: data.feeStartDate?.trim() ?? '',
    monthlyFee: data.monthlyFee ?? null,
    channel: data.channel?.trim() ?? '',
    checklist: emptyChecklist(),
    excelKey: `portal||manual||${randomUUID()}||process`,
  }).returning();

  return row;
}

export async function updateProcessChecklist(
  id: string,
  checklist: Record<string, boolean | string>,
  options?: { toggledKey?: ChecklistKey; actorName?: string; blueholeCode?: string },
) {
  const db = getDb();
  const [existing] = await db.select().from(intakeProcesses).where(eq(intakeProcesses.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');

  let nextChecklist: ProcessChecklist = { ...(existing.checklist as ProcessChecklist), ...checklist };
  if (options?.blueholeCode !== undefined) {
    nextChecklist[BLUEHOLE_CODE_KEY] = options.blueholeCode;
  }

  if (options?.toggledKey && options.actorName) {
    nextChecklist = applyChecklistMeta(nextChecklist, options.toggledKey, options.actorName);
  }

  const [row] = await db.update(intakeProcesses)
    .set({ checklist: nextChecklist as Record<string, boolean>, updatedAt: new Date() })
    .where(eq(intakeProcesses.id, id))
    .returning();
  return row!;
}

export async function updateProcessField(
  id: string,
  patch: { monthlyFee?: number | null; feeStartDate?: string; channel?: string },
) {
  const db = getDb();
  const [row] = await db.update(intakeProcesses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(intakeProcesses.id, id))
    .returning();
  if (!row) throw new Error('NOT_FOUND');
  return row;
}

export type InquiryPatch = {
  companyName?: string;
  phone?: string;
  channel?: string;
  consultant?: string;
  inquiryDate?: string;
  inquiryContent?: string;
  contractStatus?: string;
  proposedFee?: number | null;
  industry?: string;
  businessNo?: string;
  representative?: string;
  address?: string;
  extra?: Record<string, unknown>;
};

export async function getInquiryById(id: string) {
  const db = getDb();
  const [row] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, id)).limit(1);
  if (!row) throw new Error('NOT_FOUND');
  return row;
}

export async function updateInquiry(id: string, patch: InquiryPatch) {
  const db = getDb();
  const [existing] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, id)).limit(1);
  if (!existing) throw new Error('NOT_FOUND');

  const { extra: extraPatch, ...scalarPatch } = patch;
  let extra: Record<string, unknown> | undefined;
  if (extraPatch != null) {
    const merged = { ...(existing.extra ?? {}), ...extraPatch };
    const prevExt = (existing.extra?.externalRefs && typeof existing.extra.externalRefs === 'object'
      ? existing.extra.externalRefs
      : {}) as Record<string, unknown>;
    const patchExt = (extraPatch.externalRefs && typeof extraPatch.externalRefs === 'object'
      ? extraPatch.externalRefs
      : null) as Record<string, unknown> | null;
    if (patchExt) {
      merged.externalRefs = { ...prevExt, ...patchExt };
    }
    extra = merged;
  }

  const [row] = await db.update(intakeInquiries)
    .set({
      ...scalarPatch,
      ...(extra != null ? { extra } : {}),
    })
    .where(eq(intakeInquiries.id, id))
    .returning();
  return row!;
}

/** 유입관리 행 삭제 (연결된 유입프로세스 함께 삭제, 수임처 clients는 유지) */
export async function deleteIntakeInquiry(id: string, linkedProcessId?: string | null) {
  const db = getDb();
  const [inquiry] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, id)).limit(1);
  if (!inquiry) throw new Error('NOT_FOUND');

  const processIds = new Set<string>();
  if (linkedProcessId) processIds.add(linkedProcessId);

  const consultId = inquiry.extra?.consultationId;
  if (typeof consultId === 'string' && consultId.trim()) {
    const [proc] = await db
      .select({ id: intakeProcesses.id })
      .from(intakeProcesses)
      .where(eq(intakeProcesses.excelKey, `portal||consult||${consultId.trim()}||process`))
      .limit(1);
    if (proc) processIds.add(proc.id);
  }

  if (inquiry.clientId) {
    const linked = await db
      .select({ id: intakeProcesses.id })
      .from(intakeProcesses)
      .where(eq(intakeProcesses.clientId, inquiry.clientId));
    for (const p of linked) processIds.add(p.id);
  }

  const companyName = inquiry.companyName.trim();
  if (companyName && companyName !== '(미입력)') {
    const byName = await db
      .select({ id: intakeProcesses.id })
      .from(intakeProcesses)
      .where(eq(intakeProcesses.companyName, companyName));
    for (const p of byName) processIds.add(p.id);
  }

  for (const pid of processIds) {
    await db.delete(intakeProcesses).where(eq(intakeProcesses.id, pid));
  }
  await db.delete(intakeInquiries).where(eq(intakeInquiries.id, id));
}

export async function registerClientFromIntake(
  inquiryId: string,
  processId: string | null,
  assignedUserId: string,
  managerName: string,
) {
  const db = getDb();
  const [inquiry] = await db.select().from(intakeInquiries).where(eq(intakeInquiries.id, inquiryId)).limit(1);
  if (!inquiry) throw new Error('NOT_FOUND');

  let process = null;
  if (processId) {
    [process] = await db.select().from(intakeProcesses).where(eq(intakeProcesses.id, processId)).limit(1);
  }

  const companyName = (process?.companyName || inquiry.companyName).trim();
  if (!companyName || companyName === '(미입력)') throw new Error('COMPANY_NAME_REQUIRED');

  const extRefs = externalRefsFromInquiryExtra(inquiry.extra ?? {}, managerName);
  const baseIntake = {
    inquiryId,
    processId,
    ...(inquiry.address ? { address: inquiry.address } : {}),
  };
  const intakePayload = intakeDataWithExternalRefs(baseIntake, extRefs);

  if (inquiry.clientId) {
    const [existing] = await db.select().from(clients).where(eq(clients.id, inquiry.clientId)).limit(1);
    if (existing?.status === 'active') return clientToRecord(existing);
    if (existing?.status === 'intake') {
      const [updated] = await db
        .update(clients)
        .set({
          companyName,
          phone: inquiry.phone || existing.phone,
          representative: inquiry.representative || existing.representative,
          businessNo: inquiry.businessNo || existing.businessNo,
          feeSummary: process?.monthlyFee ?? inquiry.proposedFee ?? existing.feeSummary,
          assignedUserId,
          manager: managerName,
          status: 'active',
          intakeData: intakeDataWithExternalRefs({
            ...(existing.intakeData ?? {}),
            ...baseIntake,
          }, mergeExternalRefs(parseExternalRefs(existing.intakeData), extRefs)),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, existing.id))
        .returning();
      if (process && !process.clientId) {
        await db.update(intakeProcesses).set({ clientId: updated.id }).where(eq(intakeProcesses.id, process.id));
      }
      return clientToRecord(updated);
    }
  }

  const [client] = await db
    .insert(clients)
    .values({
      companyName,
      phone: inquiry.phone,
      representative: inquiry.representative,
      businessNo: inquiry.businessNo,
      manager: managerName,
      assignedUserId,
      status: 'active',
      source: 'manual_intake',
      feeSummary: process?.monthlyFee ?? inquiry.proposedFee ?? null,
      intakeData: intakePayload,
    })
    .returning();

  await db.update(intakeInquiries).set({ clientId: client.id }).where(eq(intakeInquiries.id, inquiryId));
  if (process) {
    await db.update(intakeProcesses).set({ clientId: client.id }).where(eq(intakeProcesses.id, process.id));
  }

  return clientToRecord(client);
}
