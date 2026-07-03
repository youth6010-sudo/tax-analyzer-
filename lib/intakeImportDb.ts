import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { churnRecords, clients, intakeInquiries, intakeProcesses } from '@/db/schema';
import {
  normBizNo,
  normalizeCompanyKey,
  shouldSkipOperationalRow,
  type ParsedOperational,
} from '@/lib/intakeWorkbookParse';
import { normalizeChurnClosureFields } from '@/app/config/churnOptions';

export type IntakeImportStats = {
  inquiries: { inserted: number; updated: number; skipped: number };
  processes: { inserted: number; updated: number; skipped: number };
  churns: { inserted: number; updated: number; skipped: number; clientsMarkedChurned: number };
};

type ClientLookupRow = {
  id: string;
  companyName: string;
  manager: string;
  businessNo: string;
  intakeData: Record<string, unknown>;
  ntsStatusCode: string;
  ntsClosedDate: string;
};

type ClientLookup = {
  byBiz: Map<string, string>;
  byFull: Map<string, string>;
  byName: Map<string, string>;
  byId: Map<string, ClientLookupRow>;
};

function buildClientLookup(rows: ClientLookupRow[]): ClientLookup {
  const byBiz = new Map<string, string>();
  const byFull = new Map<string, string>();
  const byName = new Map<string, string>();
  const byId = new Map<string, ClientLookupRow>();

  for (const r of rows) {
    byId.set(r.id, r);
    const biz = normBizNo(r.businessNo);
    if (biz.length >= 10 && !byBiz.has(biz)) byBiz.set(biz, r.id);

    const full = `${String(r.companyName).trim()}||${String(r.manager).trim()}`;
    if (!byFull.has(full)) byFull.set(full, r.id);

    const nameKey = normalizeCompanyKey(r.companyName);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, r.id);
  }

  return { byBiz, byFull, byName, byId };
}

function resolveClientId(
  lookup: ClientLookup,
  companyName: string,
  manager: string | null,
  businessNo?: string,
): string | null {
  const biz = normBizNo(businessNo);
  if (biz.length >= 10 && lookup.byBiz.has(biz)) return lookup.byBiz.get(biz)!;

  const trimmed = String(companyName ?? '').trim();
  if (manager) {
    const full = `${trimmed}||${String(manager).trim()}`;
    if (lookup.byFull.has(full)) return lookup.byFull.get(full)!;
  }

  const nameKey = normalizeCompanyKey(trimmed);
  if (nameKey && lookup.byName.has(nameKey)) return lookup.byName.get(nameKey)!;

  return null;
}

function mergeChecklist(
  prev: Record<string, unknown>,
  next: Record<string, boolean>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (k.startsWith('_')) continue;
    // 포털에서 이미 저장된 체크값은 엑셀 재업로드로 덮지 않음
    if (k in prev && typeof prev[k] === 'boolean') continue;
    if (v === true) out[k] = true;
    else if (out[k] === undefined) out[k] = v;
  }
  return out;
}

/**
 * 파싱된 운영 데이터(유입·프로세스·유출)를 DB에 upsert.
 * excel_key 기준 멱등 업서트이며 수임처(clients) roster는 변경하지 않는다.
 */
export async function importOperationalData(parsed: ParsedOperational): Promise<IntakeImportStats> {
  const db = getDb();

  const clientRows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      manager: clients.manager,
      businessNo: clients.businessNo,
      intakeData: clients.intakeData,
      ntsStatusCode: clients.ntsStatusCode,
      ntsClosedDate: clients.ntsClosedDate,
    })
    .from(clients);
  const lookup = buildClientLookup(clientRows);

  const stats: IntakeImportStats = {
    inquiries: { inserted: 0, updated: 0, skipped: 0 },
    processes: { inserted: 0, updated: 0, skipped: 0 },
    churns: { inserted: 0, updated: 0, skipped: 0, clientsMarkedChurned: 0 },
  };

  await db.transaction(async tx => {
    // 유입관리
    for (const row of parsed.inquiries) {
      if (shouldSkipOperationalRow(row)) {
        stats.inquiries.skipped++;
        continue;
      }
      const clientId = resolveClientId(lookup, row.companyName, null, row.businessNo);
      const existing = await tx
        .select({ id: intakeInquiries.id })
        .from(intakeInquiries)
        .where(eq(intakeInquiries.excelKey, row.excelKey))
        .limit(1);

      if (existing.length) {
        await tx
          .update(intakeInquiries)
          .set({
            clientId,
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
            extra: row.extra,
          })
          .where(eq(intakeInquiries.id, existing[0].id));
        stats.inquiries.updated++;
      } else {
        await tx.insert(intakeInquiries).values({
          clientId,
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
          extra: row.extra,
          excelKey: row.excelKey,
        });
        stats.inquiries.inserted++;
      }
    }

    // 유입프로세스
    for (const row of parsed.processes) {
      if (shouldSkipOperationalRow(row)) {
        stats.processes.skipped++;
        continue;
      }
      const clientId = resolveClientId(lookup, row.companyName, null);

      let existing = await tx
        .select({ id: intakeProcesses.id, checklist: intakeProcesses.checklist })
        .from(intakeProcesses)
        .where(eq(intakeProcesses.excelKey, row.excelKey))
        .limit(1);

      if (!existing.length) {
        existing = await tx
          .select({ id: intakeProcesses.id, checklist: intakeProcesses.checklist })
          .from(intakeProcesses)
          .where(eq(intakeProcesses.companyName, row.companyName))
          .orderBy(desc(intakeProcesses.updatedAt))
          .limit(1);
      }

      if (existing.length) {
        const merged = mergeChecklist(existing[0].checklist ?? {}, row.checklist);
        await tx
          .update(intakeProcesses)
          .set({
            clientId,
            companyName: row.companyName,
            feeStartDate: row.feeStartDate,
            monthlyFee: row.monthlyFee,
            channel: row.channel,
            checklist: merged as Record<string, boolean>,
            excelKey: row.excelKey,
            updatedAt: new Date(),
          })
          .where(eq(intakeProcesses.id, existing[0].id));
        stats.processes.updated++;
      } else {
        await tx.insert(intakeProcesses).values({
          clientId,
          companyName: row.companyName,
          feeStartDate: row.feeStartDate,
          monthlyFee: row.monthlyFee,
          channel: row.channel,
          checklist: row.checklist,
          excelKey: row.excelKey,
        });
        stats.processes.inserted++;
      }
    }

    // 유출
    for (const row of parsed.churns) {
      if (shouldSkipOperationalRow(row)) {
        stats.churns.skipped++;
        continue;
      }
      const clientId = resolveClientId(lookup, row.companyName, row.manager, row.businessNo);
      const churnedAt = row.churnedAt ? new Date(row.churnedAt) : new Date();
      const validChurnedAt = Number.isNaN(churnedAt.getTime()) ? new Date() : churnedAt;
      const linked = clientId ? lookup.byId.get(clientId) : undefined;
      const { dataCleanup, churnType } = normalizeChurnClosureFields(
        row.dataCleanup,
        row.churnType,
        { reason: row.reason, earlySign: row.earlySign },
        linked
          ? {
              intakeData: linked.intakeData,
              ntsStatusCode: linked.ntsStatusCode,
              ntsClosedDate: linked.ntsClosedDate,
            }
          : null,
      );

      const existing = await tx
        .select({ id: churnRecords.id })
        .from(churnRecords)
        .where(eq(churnRecords.excelKey, row.excelKey))
        .limit(1);

      if (existing.length) {
        await tx
          .update(churnRecords)
          .set({
            clientId,
            companyName: row.companyName,
            reason: row.reason,
            churnType,
            dataCleanup,
            earlySign: row.earlySign,
            feeAmount: row.feeAmount,
            manager: row.manager,
            churnedAt: validChurnedAt,
          })
          .where(eq(churnRecords.id, existing[0].id));
        stats.churns.updated++;
      } else {
        await tx.insert(churnRecords).values({
          clientId,
          companyName: row.companyName,
          reason: row.reason,
          detail: '',
          churnType,
          dataCleanup,
          earlySign: row.earlySign,
          feeAmount: row.feeAmount,
          manager: row.manager,
          churnedAt: validChurnedAt,
          excelKey: row.excelKey,
        });
        stats.churns.inserted++;
      }

      if (clientId) {
        const res = await tx
          .update(clients)
          .set({ status: 'churned', updatedAt: new Date() })
          .where(and(eq(clients.id, clientId), eq(clients.status, 'active')))
          .returning({ id: clients.id });
        if (res.length) stats.churns.clientsMarkedChurned++;
      }
    }
  });

  return stats;
}

/** 미리보기용 통계 (DB 변경 없음) */
export function summarizeParsed(parsed: ParsedOperational) {
  const countSkip = (rows: { companyName?: string; representative?: string; businessNo?: string }[]) =>
    rows.filter(shouldSkipOperationalRow).length;
  return {
    inquiries: { total: parsed.inquiries.length, skipped: countSkip(parsed.inquiries) },
    processes: { total: parsed.processes.length, skipped: countSkip(parsed.processes) },
    churns: { total: parsed.churns.length, skipped: countSkip(parsed.churns) },
    sheets: parsed.sheets,
  };
}
