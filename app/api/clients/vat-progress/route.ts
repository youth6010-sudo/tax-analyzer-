import { NextRequest, NextResponse } from 'next/server';
import { isDataViewer, requireUser } from '@/lib/auth';
import { assertCanAccessClient, canEditVatFilingFee } from '@/lib/clientAccess';
import { canUseIndieFeatures } from '@/lib/masterAccess';
import { getClientById, listClients, updateClientDetail } from '@/lib/clientsDb';
import { listSimplePayrollFilingsByKeys } from '@/lib/simplePayrollFilingsDb';
import { listYearEndFilings } from '@/lib/yearEndFilingsDb';
import { loadFilingCheckSessionWithCarry, loadFilingCheckSessionsForTargetList } from '@/lib/taxFilingChecksDb';
import { simplePayrollMonthlyPeriodKey, simplePayrollPeriodKeysForYear } from '@/lib/periodUtils';
import { getClientCategoryForFilter, getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import {
  filingTargets,
  isCorporateClient,
  periodKey as filingPeriodKey,
  type VatPhase,
  VAT_PHASES,
} from '@/app/utils/filingCheck';
import { readIncomeTypes, readYearEndTypes } from '@/lib/incomeTypes';
import { yearEndColumnActive } from '@/lib/incomeTypeFilingGrid';
import { YEAR_END_INCOME_KEYS, type YearEndIncomeKey } from '@/app/types/incomeTypes';
import {
  readVatMaterialFlags,
  readVatPeriodProgress,
  readVatFilingFee,
  mergeVatFilingFeePatch,
  vatProgressPeriodKey,
  type VatMaterialFlags,
  type VatPeriodProgress,
  type VatProgressColumnDef,
} from '@/lib/vatEntryProgress';
import {
  computeVatAnnualProgressForClient,
  mergeVatAnnualYearStatePatch,
  mergePhaseMarksPatch,
  mergeReceiveEntryQuartersPatch,
  mergeVatProgressMarkWrites,
  readVatAnnualYearState,
  type VatAnnualMarkStatus,
  type VatAnnualYearState,
} from '@/lib/vatAnnualProgress';
import { syncAnnualMeetingCalendar } from '@/lib/vatAnnualMeetingCalendar';
import { syncAnnualDueReminders } from '@/lib/vatAnnualDueReminder';
import { getVatProgressLayout, saveVatProgressLayout } from '@/lib/vatProgressLayoutDb';
import type { ClientRecord } from '@/app/types/client';

const VAT_LABOR_KEYS = [
  'employed',
  'daily',
  'retirement',
  'bizIncome',
  'otherTax',
  'interestDividend',
] as const;

type VatLaborKey = (typeof VAT_LABOR_KEYS)[number];

type VatLaborStatus = Record<VatLaborKey, { target: boolean; filed: boolean }>;

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

  const addIfLabor = (clientId: string, incomeType: string) => {
    if (!(VAT_LABOR_KEYS as readonly string[]).includes(incomeType)) return;
    const set = map.get(clientId) ?? new Set<VatLaborKey>();
    set.add(incomeType as VatLaborKey);
    map.set(clientId, set);
  };

  for (const r of spRows) {
    if (!r.filed) continue;
    addIfLabor(r.clientId, r.incomeType);
  }
  for (const r of yeRows) {
    if (!r.filed) continue;
    addIfLabor(r.clientId, r.incomeType);
  }
  return map;
}

/** 원천 월별 접수(간이지급 월 period) — 연간진행표 1~12월 칸 */
async function laborFiledMonthsByClient(year: number, clientIds: string[]) {
  const map = new Map<string, boolean[]>();
  for (const id of clientIds) map.set(id, Array.from({ length: 12 }, () => false));

  const periodKeys = Array.from({ length: 12 }, (_, i) =>
    simplePayrollMonthlyPeriodKey(year, i + 1),
  );
  const rows = await listSimplePayrollFilingsByKeys(periodKeys, clientIds);
  for (const r of rows) {
    if (!r.filed) continue;
    const m = Number(String(r.periodKey || '').split('-')[1]);
    if (!m || m < 1 || m > 12) continue;
    const arr = map.get(r.clientId);
    if (arr) arr[m - 1] = true;
  }
  return map;
}

/** 해당 연도 간이지급에서 접수된 소득유형 (연말정산 열 활성용) */
async function yearSimplePayrollFiledByClient(year: number, clientIds: string[]) {
  const map = new Map<string, Set<string>>();
  for (const id of clientIds) map.set(id, new Set());
  const periodKeys = simplePayrollPeriodKeysForYear(year);
  const rows = await listSimplePayrollFilingsByKeys(periodKeys, clientIds);
  for (const r of rows) {
    if (!r.filed) continue;
    const set = map.get(r.clientId) ?? new Set<string>();
    set.add(r.incomeType);
    map.set(r.clientId, set);
  }
  return map;
}

function laborStatusForClient(
  intakeData: Record<string, unknown> | undefined,
  filed: Set<VatLaborKey> | undefined,
  opts?: { annual?: boolean; yearSpFiled?: ReadonlySet<string> },
): VatLaborStatus {
  const income = readIncomeTypes(intakeData);
  const yearEnd = readYearEndTypes(intakeData);
  const flags =
    intakeData?.taxFlags && typeof intakeData.taxFlags === 'object'
      ? (intakeData.taxFlags as Record<string, boolean>)
      : {};
  const filedSet = filed ?? new Set<VatLaborKey>();

  if (opts?.annual) {
    const out = emptyLaborStatus();
    for (const key of YEAR_END_INCOME_KEYS) {
      const yeKey = key as YearEndIncomeKey;
      const active =
        yearEndColumnActive(yeKey, income, yearEnd, opts.yearSpFiled) || filedSet.has(key);
      out[key] = { target: active, filed: filedSet.has(key) };
    }
    // 간이지급 일용 있으면 원천에 같이 표시
    const dailyActive =
      !!income.daily || !!flags.daily || !!opts.yearSpFiled?.has('daily') || filedSet.has('daily');
    out.daily = { target: dailyActive, filed: filedSet.has('daily') };
    return out;
  }

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

/** 신고대상확인(부가세) 세션 — 담당자별 일괄 로드 */
async function loadVatFilingSessions(
  managers: string[],
  year: number,
  phase: VatPhase,
): Promise<Map<string, Awaited<ReturnType<typeof loadFilingCheckSessionWithCarry>>['data']>> {
  const pk = filingPeriodKey('vat', {
    year,
    month: 1,
    vatPhase: phase,
    half: 'H1',
  });
  const uniqueManagers = [...new Set(managers.map(m => m.trim()).filter(Boolean))];
  return loadFilingCheckSessionsForTargetList(uniqueManagers, 'vat', pk);
}

function isExcludedByVatSession(
  session:
    | Awaited<ReturnType<typeof loadFilingCheckSessionWithCarry>>['data']
    | null
    | undefined,
  clientId: string,
): boolean {
  if (!session) return false;
  if (session.forceIncluded?.[clientId]) return false;
  return Object.prototype.hasOwnProperty.call(session.excluded ?? {}, clientId);
}

/**
 * 신고대상확인 부가세 활성 목록과 동일:
 * filingTargets + 수동추가 − 해당 담당 세션에서 제외된 업체
 */
function resolveVatReviewTargets(
  all: ClientRecord[],
  phase: VatPhase,
  sessionsByManager: Map<
    string,
    Awaited<ReturnType<typeof loadFilingCheckSessionWithCarry>>['data']
  >,
): ClientRecord[] {
  const base = filingTargets(all, 'vat', { vatPhase: phase });
  const byId = new Map<string, ClientRecord>();
  for (const c of base) {
    const mgr = c.manager?.trim() || '';
    const session = sessionsByManager.get(mgr);
    if (isExcludedByVatSession(session, c.id)) continue;
    byId.set(c.id, c);
  }
  for (const session of sessionsByManager.values()) {
    if (!session?.extraClients?.length) continue;
    for (const m of session.extraClients) {
      if (!m?.id || byId.has(m.id)) continue;
      if (isExcludedByVatSession(session, m.id)) continue;
      const full = all.find(c => c.id === m.id);
      if (full) {
        const mgr = full.manager?.trim() || '';
        if (isExcludedByVatSession(sessionsByManager.get(mgr), full.id)) continue;
        byId.set(full.id, full);
      }
    }
  }
  return [...byId.values()];
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
    const viewRaw = sp.get('view');
    const view = viewRaw === 'year' || viewRaw === 'annual' ? 'annual' : 'period';
    // 신고대상확인과 동일: 데이터뷰어=전체 수임처 / 그 외=담당 수임처
    const canViewAll = isDataViewer(user);
    const canEditLayout = canUseIndieFeatures(user);
    const layout = await getVatProgressLayout();

    const all = await listClients({
      mineOnly: !canViewAll,
      userId: user.id,
      userName: user.name || '',
      includeChurned: false,
      includeVatProgress: true,
    });

    const managersSeed = [
      ...new Set(
        all
          .map(c => c.manager?.trim() || '')
          .filter(Boolean),
      ),
    ];

    let targets: ClientRecord[];
    if (view === 'annual') {
      const byId = new Map<string, ClientRecord>();
      const phaseSessions = await Promise.all(
        VAT_PHASES.map(async p => ({
          phase: p,
          sessions: await loadVatFilingSessions(managersSeed, year, p),
        })),
      );
      for (const { phase: p, sessions } of phaseSessions) {
        for (const c of resolveVatReviewTargets(all, p, sessions)) {
          byId.set(c.id, c);
        }
      }
      targets = [...byId.values()];
    } else {
      const sessions = await loadVatFilingSessions(managersSeed, year, phase);
      targets = resolveVatReviewTargets(all, phase, sessions);
    }

    const targetIds = targets.map(c => c.id);
    const [laborFiled, laborMonths, yearSpFiled] = await Promise.all([
      laborFiledByClient(year, targetIds),
      view === 'annual' ? laborFiledMonthsByClient(year, targetIds) : Promise.resolve(null),
      view === 'annual' ? yearSimplePayrollFiledByClient(year, targetIds) : Promise.resolve(null),
    ]);

    const rows = targets.map(c => {
      const flags = readVatMaterialFlags(c.intakeData);
      const labor = laborStatusForClient(c.intakeData, laborFiled.get(c.id), {
        annual: view === 'annual',
        yearSpFiled: yearSpFiled?.get(c.id),
      });
      const base = {
        id: c.id,
        companyName: c.companyName,
        representative: c.representative || '',
        businessNo: c.businessNo || '',
        corporateNo: c.corporateNo || '',
        douzoneCode: getClientDouzoneCode(c),
        manager: c.manager || '',
        isCorporate: isCorporateClient(c),
        mainCategory: getClientCategoryForFilter(c),
        flags,
        labor,
      };

      if (view === 'annual') {
        const annual = readVatAnnualYearState(c.intakeData, year);
        const annualSummary = computeVatAnnualProgressForClient(
          c,
          labor,
          year,
          VAT_PHASES,
          c.intakeData,
          laborMonths?.get(c.id),
          isCorporateClient(c),
        );
        return { ...base, annual, annualSummary };
      }

      const periodKey = vatProgressPeriodKey(year, phase);
      const progress = readVatPeriodProgress(c.intakeData, periodKey);
      return {
        ...base,
        progress,
        filingFee: readVatFilingFee(c.intakeData, periodKey),
        filingFeeEditable: canEditVatFilingFee(user, c),
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
      canViewAll,
      canEditLayout,
      loginId: user.loginId || '',
      layout,
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
    const user = await requireUser();
    const body = (await request.json()) as {
      clientId?: string;
      year?: number;
      phase?: string;
      progress?: VatPeriodProgress;
      flags?: Partial<VatMaterialFlags>;
      filingFee?: number | null;
      layout?: VatProgressColumnDef[];
      annual?: Partial<VatAnnualYearState>;
      /** 연간진행표 자료수취·입력 분기 (통장·기타증빙 → 부가세 OX) */
      dualQuarter?: {
        progressKey: string;
        receiveQuarters?: boolean[];
        entryQuarters?: boolean[];
        /** 기타증빙 X 포함 기수 마크 */
        phaseMarks?: VatAnnualMarkStatus[];
      };
      /** 연간진행표에서 OX 수정 후 summary 반환 */
      includeAnnual?: boolean;
    };

    if (body.layout) {
      if (!canUseIndieFeatures(user)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const layout = await saveVatProgressLayout(body.layout, user.id);
      return NextResponse.json({ ok: true, layout });
    }

    const clientId = body.clientId?.trim();
    if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });
    const year = Number(body.year || new Date().getFullYear());
    const client = await getClientById(clientId);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    assertCanAccessClient(user, client);

    if (body.filingFee !== undefined) {
      if (!canEditVatFilingFee(user, client)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const phase = String(body.phase || '1기 확정');
      if (!VAT_PHASES.includes(phase as VatPhase)) {
        return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
      }
      const periodKey = vatProgressPeriodKey(year, phase);
      const filingFee =
        body.filingFee === null ? null : Math.round(Number(body.filingFee));
      const intakeData = mergeVatFilingFeePatch(
        { ...(client.intakeData ?? {}) },
        periodKey,
        filingFee,
      );
      const updated = await updateClientDetail(clientId, { intakeData });
      return NextResponse.json({
        ok: true,
        filingFee: readVatFilingFee(updated.intakeData, periodKey),
      });
    }

    let intakeData = { ...(client.intakeData ?? {}) };

    const buildAnnualResponse = async (updated: ClientRecord) => {
      const [laborFiled, yearSpFiled] = await Promise.all([
        laborFiledByClient(year, [clientId]),
        yearSimplePayrollFiledByClient(year, [clientId]),
      ]);
      const labor = laborStatusForClient(updated.intakeData, laborFiled.get(clientId), {
        annual: true,
        yearSpFiled: yearSpFiled.get(clientId),
      });
      return {
        annual: readVatAnnualYearState(updated.intakeData, year),
        annualSummary: computeVatAnnualProgressForClient(
          updated,
          labor,
          year,
          VAT_PHASES,
          updated.intakeData,
          undefined,
          isCorporateClient(updated),
        ),
      };
    };

    if (body.dualQuarter?.progressKey) {
      if (body.dualQuarter.phaseMarks) {
        intakeData = mergePhaseMarksPatch(
          intakeData,
          year,
          body.dualQuarter.progressKey,
          body.dualQuarter.phaseMarks,
        );
      } else {
        intakeData = mergeReceiveEntryQuartersPatch(
          intakeData,
          year,
          body.dualQuarter.progressKey,
          body.dualQuarter.receiveQuarters ?? [],
          body.dualQuarter.entryQuarters ?? [],
        );
      }
      const updated = await updateClientDetail(clientId, { intakeData });
      const annualPayload = await buildAnnualResponse(updated);
      return NextResponse.json({ ok: true, ...annualPayload });
    }

    if (body.annual) {
      intakeData = mergeVatAnnualYearStatePatch(intakeData, year, body.annual);
      // 연간 통장 분기 → 부가세 bankStatement OX 동기화 (+확정→예정)
      if (
        body.annual.bankReceiveQuarters !== undefined ||
        body.annual.bankEntryQuarters !== undefined
      ) {
        const st = readVatAnnualYearState(intakeData, year);
        intakeData = mergeReceiveEntryQuartersPatch(
          intakeData,
          year,
          'bankStatement',
          st.bankReceiveQuarters ?? [],
          st.bankEntryQuarters ?? [],
        );
      }
      let updated = await updateClientDetail(clientId, { intakeData });
      const annualAfter = readVatAnnualYearState(updated.intakeData, year);
      const companyName = updated.companyName || client.companyName || '';
      const managerName = (updated.manager || client.manager || '').trim();
      const [meetingPatch, duePatch] = await Promise.all([
        syncAnnualMeetingCalendar({
          clientId,
          companyName,
          annual: annualAfter,
        }),
        syncAnnualDueReminders({
          managerName,
          clientId,
          companyName,
          year,
          annual: annualAfter,
        }),
      ]);
      const combinedPatch = { ...meetingPatch, ...duePatch };
      if (Object.keys(combinedPatch).length > 0) {
        intakeData = mergeVatAnnualYearStatePatch(
          { ...(updated.intakeData ?? {}) },
          year,
          combinedPatch,
        );
        updated = await updateClientDetail(clientId, { intakeData });
      }
      const annualPayload = await buildAnnualResponse(updated);
      return NextResponse.json({ ok: true, ...annualPayload });
    }

    const phase = String(body.phase || '1기 확정');
    if (!VAT_PHASES.includes(phase as VatPhase)) {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }
    const periodKey = vatProgressPeriodKey(year, phase);

    if (body.flags) {
      const prev = readVatMaterialFlags(intakeData);
      intakeData = {
        ...intakeData,
        vatMaterialFlags: {
          agencySales: body.flags.agencySales ?? prev.agencySales,
          zeroRateSales: body.flags.zeroRateSales ?? prev.zeroRateSales,
          nonDeductible: body.flags.nonDeductible ?? prev.nonDeductible,
          manualEntry: body.flags.manualEntry ?? prev.manualEntry,
        },
      };
    }
    if (body.progress) {
      // 확정 체크 시 대응 예정이 비어 있으면 예정까지 함께 기록
      intakeData = mergeVatProgressMarkWrites(
        intakeData,
        year,
        phase as VatPhase,
        body.progress,
      );
    }

    const updated = await updateClientDetail(clientId, { intakeData });
    const response: Record<string, unknown> = {
      ok: true,
      flags: readVatMaterialFlags(updated.intakeData),
      progress: readVatPeriodProgress(updated.intakeData, periodKey),
    };

    if (body.includeAnnual) {
      Object.assign(response, await buildAnnualResponse(updated));
    }

    return NextResponse.json(response);
  } catch (e) {
    return apiError(e);
  }
}
