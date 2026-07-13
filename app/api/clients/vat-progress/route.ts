import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getClientById, listClients, updateClientDetail } from '@/lib/clientsDb';
import { listSimplePayrollFilingsByKeys } from '@/lib/simplePayrollFilingsDb';
import { listYearEndFilings } from '@/lib/yearEndFilingsDb';
import { getFilingCheckSession } from '@/lib/taxFilingChecksDb';
import { simplePayrollPeriodKeysForYear } from '@/lib/periodUtils';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import {
  filingTargets,
  isCorporateClient,
  periodKey as filingPeriodKey,
  vatYearProgressPhases,
  type VatPhase,
  VAT_PHASES,
} from '@/app/utils/filingCheck';
import { readIncomeTypes, readYearEndTypes } from '@/lib/incomeTypes';
import {
  mergeVatPeriodProgressPatch,
  readVatMaterialFlags,
  readVatPeriodProgress,
  summarizeVatPeriodProgress,
  vatProgressPeriodKey,
  visibleVatProgressKeys,
  type VatMaterialFlags,
  type VatPeriodProgress,
  type VatProgressItemKey,
} from '@/lib/vatEntryProgress';
import type { ClientRecord } from '@/app/types/client';

export const VAT_LABOR_KEYS = [
  'employed',
  'daily',
  'retirement',
  'bizIncome',
  'otherTax',
  'interestDividend',
] as const;

export type VatLaborKey = (typeof VAT_LABOR_KEYS)[number];

export type VatLaborStatus = Record<VatLaborKey, { target: boolean; filed: boolean }>;

function emptyLaborStatus(): VatLaborStatus {
  return {
    employed: { target: false, filed: false },
    daily: { target: false, filed: false },
    retirement: { target: false, filed: false },
    bizIncome: { target: false, filed: false },
    otherTax: { target: false, filed: false },
    interestDividend: { target: false, filed: false },
  };
}

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[vat-progress]', e);
  return NextResponse.json(
    { error: e instanceof Error ? e.message : 'Server error' },
    { status: 500 },
  );
}

async function laborFiledByClient(year: number, clientIds: string[]) {
  const map = new Map<string, Set<VatLaborKey>>();
  for (const id of clientIds) map.set(id, new Set());

  const periodKeys = simplePayrollPeriodKeysForYear(year);
  const [spRows, yeRows] = await Promise.all([
    listSimplePayrollFilingsByKeys(periodKeys, clientIds),
    listYearEndFilings(year, clientIds),
  ]);

  for (const r of spRows) {
    if (!r.filed) continue;
    const set = map.get(r.clientId) ?? new Set();
    if (
      r.incomeType === 'employed' ||
      r.incomeType === 'daily' ||
      r.incomeType === 'bizIncome' ||
      r.incomeType === 'otherTax' ||
      r.incomeType === 'retirement' ||
      r.incomeType === 'interestDividend'
    ) {
      set.add(r.incomeType);
    }
    map.set(r.clientId, set);
  }
  for (const r of yeRows) {
    if (!r.filed) continue;
    const set = map.get(r.clientId) ?? new Set();
    if (
      r.incomeType === 'employed' ||
      r.incomeType === 'retirement' ||
      r.incomeType === 'bizIncome' ||
      r.incomeType === 'otherTax' ||
      r.incomeType === 'interestDividend'
    ) {
      set.add(r.incomeType);
    }
    map.set(r.clientId, set);
  }
  return map;
}

function laborStatusForClient(
  intakeData: Record<string, unknown> | undefined,
  filed: Set<VatLaborKey> | undefined,
): VatLaborStatus {
  const income = readIncomeTypes(intakeData);
  const yearEnd = readYearEndTypes(intakeData);
  const flags =
    intakeData?.taxFlags && typeof intakeData.taxFlags === 'object'
      ? (intakeData.taxFlags as Record<string, boolean>)
      : {};
  const filedSet = filed ?? new Set<VatLaborKey>();

  const targetOf = (key: VatLaborKey): boolean => {
    if (key === 'employed') return !!(income.employed || yearEnd.employed || flags.employed);
    if (key === 'daily') return !!(income.daily || flags.daily);
    if (key === 'retirement') return !!(income.retirement || yearEnd.retirement || flags.retirement);
    if (key === 'bizIncome') return !!(income.bizIncome || yearEnd.bizIncome || flags.bizIncome);
    if (key === 'otherTax') return !!(income.otherTax || yearEnd.otherTax || flags.otherTax);
    if (key === 'interestDividend') {
      return !!(income.interestDividend || yearEnd.interestDividend || flags.interestDividend);
    }
    return false;
  };

  const out = emptyLaborStatus();
  for (const key of VAT_LABOR_KEYS) {
    out[key] = { target: targetOf(key), filed: filedSet.has(key) };
  }
  return out;
}

/** 신고대상확인(부가세) 세션에서 수동 제외된 clientId */
async function loadFilingExcludedIds(
  managers: string[],
  year: number,
  phase: VatPhase,
): Promise<Set<string>> {
  const pk = filingPeriodKey('vat', {
    year,
    month: 1,
    vatPhase: phase,
    half: 'first',
  });
  const excluded = new Set<string>();
  const uniqueManagers = [...new Set(managers.map(m => m.trim()).filter(Boolean))];
  await Promise.all(
    uniqueManagers.map(async manager => {
      const session = await getFilingCheckSession(manager, 'vat', pk);
      if (!session) return;
      for (const [id, reason] of Object.entries(session.excluded ?? {})) {
        if (session.forceIncluded?.[id]) continue;
        if (id) excluded.add(id);
        void reason;
      }
    }),
  );
  return excluded;
}

function progressKeysForClient(c: ClientRecord): VatProgressItemKey[] {
  return visibleVatProgressKeys(c);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const sp = request.nextUrl.searchParams;
    const year = Number(sp.get('year') || new Date().getFullYear());
    const phase = (sp.get('phase') || '1기 확정') as VatPhase;
    if (!VAT_PHASES.includes(phase)) {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }
    const mine = sp.get('mine') !== '0';
    const view = sp.get('view') === 'year' ? 'year' : 'period';

    const all = await listClients({
      mineOnly: mine,
      userId: user.id,
      userName: user.name || '',
      includeChurned: false,
    });

    const managersSeed = [user.name || '', ...all.map(c => c.manager || '')];

    let targets: ClientRecord[];
    if (view === 'year') {
      // 연간: 기수별 신고대상 합집합 (해당 기수에서 제외된 건은 그 기수만 빠짐)
      const byId = new Map<string, ClientRecord>();
      for (const p of VAT_PHASES) {
        const list = filingTargets(all, 'vat', { vatPhase: p });
        const excludedIds = await loadFilingExcludedIds(managersSeed, year, p);
        for (const c of list) {
          if (excludedIds.has(c.id)) continue;
          byId.set(c.id, c);
        }
      }
      targets = [...byId.values()];
    } else {
      // 신고분별: 해당 기수 신고대상확인 기준
      targets = filingTargets(all, 'vat', { vatPhase: phase });
      const excludedIds = await loadFilingExcludedIds(managersSeed, year, phase);
      targets = targets.filter(c => !excludedIds.has(c.id));
    }

    const laborFiled = await laborFiledByClient(
      year,
      targets.map(c => c.id),
    );

    const rows = targets.map(c => {
      const flags = readVatMaterialFlags(c.intakeData);
      const keys = progressKeysForClient(c);
      const labor = laborStatusForClient(c.intakeData, laborFiled.get(c.id));
      const yearPhases = vatYearProgressPhases(c);
      const base = {
        id: c.id,
        companyName: c.companyName,
        representative: c.representative || '',
        businessNo: c.businessNo || '',
        corporateNo: c.corporateNo || '',
        douzoneCode: getClientDouzoneCode(c),
        manager: c.manager || '',
        isCorporate: isCorporateClient(c),
        flags,
        labor,
        progressKeys: keys,
        yearPhases,
      };

      if (view === 'year') {
        const byPhase: Record<
          string,
          {
            progress: VatPeriodProgress;
            summary: { done: number; total: number; filledLabels: string[] };
          }
        > = {};
        for (const p of yearPhases) {
          const pk = vatProgressPeriodKey(year, p);
          const progress = readVatPeriodProgress(c.intakeData, pk);
          byPhase[p] = {
            progress,
            summary: summarizeVatPeriodProgress(progress, keys),
          };
        }
        return { ...base, progressByPhase: byPhase };
      }

      const periodKey = vatProgressPeriodKey(year, phase);
      const progress = readVatPeriodProgress(c.intakeData, periodKey);
      return {
        ...base,
        progress,
        summary: summarizeVatPeriodProgress(progress, keys),
      };
    });

    rows.sort((a, b) => {
      const ca = a.douzoneCode.replace(/\D/g, '');
      const cb = b.douzoneCode.replace(/\D/g, '');
      if (ca && cb) return Number(ca) - Number(cb);
      if (ca) return -1;
      if (cb) return 1;
      return a.companyName.localeCompare(b.companyName, 'ko');
    });

    return NextResponse.json({
      year,
      phase,
      view,
      periodKey: vatProgressPeriodKey(year, phase),
      phases: [...VAT_PHASES],
      rows,
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireUser();
    const body = (await request.json()) as {
      clientId?: string;
      year?: number;
      phase?: string;
      progress?: VatPeriodProgress;
      flags?: Partial<VatMaterialFlags>;
    };
    const clientId = body.clientId?.trim();
    if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });
    const year = Number(body.year || new Date().getFullYear());
    const phase = String(body.phase || '1기 확정');
    if (!VAT_PHASES.includes(phase as VatPhase)) {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }
    const periodKey = vatProgressPeriodKey(year, phase);

    const client = await getClientById(clientId);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let intakeData = { ...(client.intakeData ?? {}) };
    if (body.flags) {
      const prev = readVatMaterialFlags(intakeData);
      intakeData = {
        ...intakeData,
        vatMaterialFlags: {
          agencySales: body.flags.agencySales ?? prev.agencySales,
          zeroRateSales: body.flags.zeroRateSales ?? prev.zeroRateSales,
          nonDeductible: body.flags.nonDeductible ?? prev.nonDeductible,
        },
      };
    }
    if (body.progress) {
      intakeData = mergeVatPeriodProgressPatch(intakeData, periodKey, body.progress);
    }

    const updated = await updateClientDetail(clientId, { intakeData });
    return NextResponse.json({
      ok: true,
      flags: readVatMaterialFlags(updated.intakeData),
      progress: readVatPeriodProgress(updated.intakeData, periodKey),
    });
  } catch (e) {
    return apiError(e);
  }
}
