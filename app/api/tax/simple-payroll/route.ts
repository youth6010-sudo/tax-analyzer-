import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isMasterUser } from '@/lib/clientAccess';
import { listClients, updateClientDetail } from '@/lib/clientsDb';
import { patchIncomeTypes, readIncomeTypes } from '@/lib/incomeTypes';
import {
  listSimplePayrollFilingsByKeys,
  listSimplePayrollPrevFiledKeys,
  matchSimplePayrollFromExcel,
  resetSimplePayrollReceipt,
  upsertSimplePayrollFilings,
} from '@/lib/simplePayrollFilingsDb';
import {
  getExcludedClientIds,
  getExtraClientIds,
  getForceIncludedClientIds,
  getWithholdingRowNotesForPeriod,
} from '@/lib/taxFilingChecksDb';
import {
  employedSimplePayrollPeriodKey,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';
import {
  buildSimplePayrollGrid,
  computeIncomeGridStats,
  listUnreceivedByColumn,
  listUnreceivedCompanyNames,
  mergeFilingTargetClients,
  simplePayrollPeriodMeta,
} from '@/lib/incomeTypeFilingGrid';
import {
  buildSimplePayrollFilingTypeMap,
  filterSimplePayrollFilingTypes,
  normalizeBizNo,
  simplePayrollTargetsForPeriod,
  type HometaxFiling,
} from '@/app/utils/filingCheck';
import type { IncomeTypeKey } from '@/app/types/incomeTypes';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[simple-payroll]', e);
  const message = e instanceof Error ? e.message : 'Server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const periodKey = searchParams.get('periodKey') ?? '';
    const manager = searchParams.get('manager') ?? user.name;

    if (!periodKey) {
      return NextResponse.json({ error: 'periodKey required' }, { status: 400 });
    }

    const meta = simplePayrollPeriodMeta(periodKey);
    const { monthlyPeriodKey, employedPeriodKey, employedFilingMonth } = meta;

    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
      includeChurned: true,
    });

    const excluded = await getExcludedClientIds(manager, 'withholding', monthlyPeriodKey);
    const forceIncluded = await getForceIncludedClientIds(manager, monthlyPeriodKey);
    const extraClientIds = await getExtraClientIds(manager, 'simplePayroll', monthlyPeriodKey);
    const rowNotes = await getWithholdingRowNotesForPeriod(manager, monthlyPeriodKey);
    const periodKeys = employedPeriodKey ? [monthlyPeriodKey, employedPeriodKey] : [monthlyPeriodKey];
    const [saved, prevFiledKeys] = await Promise.all([
      listSimplePayrollFilingsByKeys(periodKeys),
      listSimplePayrollPrevFiledKeys(meta.year, meta.month),
    ]);
    const { grid } = buildSimplePayrollGrid(
      clients,
      periodKey,
      saved,
      excluded,
      rowNotes,
      forceIncluded,
      prevFiledKeys,
      extraClientIds,
    );

    return NextResponse.json({
      year: meta.year,
      month: meta.month,
      monthlyPeriodKey,
      employedPeriodKey,
      employedFilingMonth,
      excluded,
      grid,
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      year?: number;
      month?: number;
      periodKey?: string;
      rows?: {
        clientId: string;
        incomeType: IncomeTypeKey;
        periodKey: string;
        filed: boolean;
        acceptanceDate?: string;
        acceptanceMethod?: string;
        notes?: string;
      }[];
    };

    const rows = body.rows;
    if (!rows) {
      return NextResponse.json({ error: 'rows required' }, { status: 400 });
    }

    const byPeriod = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byPeriod.get(row.periodKey) ?? [];
      list.push(row);
      byPeriod.set(row.periodKey, list);
    }

    for (const [pk, batch] of byPeriod) {
      await upsertSimplePayrollFilings(
        pk,
        batch.map(r => ({
          clientId: r.clientId,
          incomeType: r.incomeType,
          filed: r.filed,
          acceptanceDate: r.acceptanceDate ?? '',
          acceptanceMethod: r.acceptanceMethod ?? '',
          notes: r.notes ?? '',
        })),
        user.name,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      periodKey?: string;
      bizNos?: string[];
      filings?: HometaxFiling[];
      manager?: string;
    };
    if (!body.periodKey) {
      return NextResponse.json({ error: 'periodKey required' }, { status: 400 });
    }
    const filings = body.filings ?? [];
    if (filings.length === 0 && (!body.bizNos || body.bizNos.length === 0)) {
      return NextResponse.json({ error: 'filings or bizNos required' }, { status: 400 });
    }

    const { year, month } = simplePayrollPeriodMeta(body.periodKey);
    const monthlyKey = simplePayrollMonthlyPeriodKey(year, month);
    const employedKey = employedSimplePayrollPeriodKey(year, month);

    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
      includeChurned: true,
    });

    const manager = body.manager ?? user.name;
    const effectiveManager = manager === '전체' ? user.name : manager;
    let excluded = await getExcludedClientIds(effectiveManager, 'withholding', monthlyKey);
    const extraClientIds = await getExtraClientIds(effectiveManager, 'simplePayroll', monthlyKey);

    const targetClients = mergeFilingTargetClients(
      simplePayrollTargetsForPeriod(clients, month),
      clients,
      extraClientIds,
    );
    const clientByBiz = new Map<string, (typeof targetClients)[0]>();
    for (const c of targetClients) {
      const biz = normalizeBizNo(c.businessNo);
      if (biz.length === 10 && !clientByBiz.has(biz)) clientByBiz.set(biz, c);
    }

    const { map: filingTypeMap, unmappedRows, parsedRows } = buildSimplePayrollFilingTypeMap(filings);
    const fileBizSet = new Set(
      filings.length > 0
        ? filings.map(f => normalizeBizNo(f.bizNo)).filter(b => b.length === 10)
        : (body.bizNos ?? []).map(b => b.replace(/\D/g, '')).filter(b => b.length === 10),
    );
    const uploadNameByBiz = new Map<string, string>();
    for (const f of filings) {
      const biz = normalizeBizNo(f.bizNo);
      if (biz.length === 10 && f.name?.trim() && !uploadNameByBiz.has(biz)) {
        uploadNameByBiz.set(biz, f.name.trim());
      }
    }

    const addedNames: string[] = [];
    const stillMissing: string[] = [];

    for (const biz of fileBizSet) {
      const client = clientByBiz.get(biz);
      const displayName = client?.companyName || uploadNameByBiz.get(biz) || biz;
      if (!client) {
        stillMissing.push(displayName);
        continue;
      }

      let changed = false;
      // 원천세 제외는 유지 — 간이지급 업로드가 원천세 신고대상확인을 지우지 않음

      const receiptTypes = filingTypeMap.get(biz);
      if (receiptTypes && receiptTypes.size > 0) {
        const types = readIncomeTypes(client.intakeData);
        const patch: Partial<Record<IncomeTypeKey, boolean>> = {};
        for (const t of receiptTypes) {
          if (t === 'laborContentReport') continue;
          if (t === 'employed' && !employedKey) continue;
          if (!types[t]) {
            patch[t] = true;
            changed = true;
          }
        }
        if (Object.keys(patch).length > 0) {
          const nextIntake = patchIncomeTypes(
            (client.intakeData ?? {}) as Record<string, unknown>,
            patch,
          );
          await updateClientDetail(client.id, { intakeData: nextIntake });
          client.intakeData = nextIntake;
        }
      } else {
        // 신고서명 없이 사업자만 온 경우 — 아무 유형도 없으면 기타로 활성화해 리스트에 올림
        const types = readIncomeTypes(client.intakeData);
        const hasAny =
          types.daily || types.bizIncome || types.otherTax || (types.employed && Boolean(employedKey));
        if (!hasAny) {
          const patch = { otherTax: true } as Partial<Record<IncomeTypeKey, boolean>>;
          const nextIntake = patchIncomeTypes(
            (client.intakeData ?? {}) as Record<string, unknown>,
            patch,
          );
          await updateClientDetail(client.id, { intakeData: nextIntake });
          client.intakeData = nextIntake;
          changed = true;
        }
      }

      if (changed) addedNames.push(displayName);
    }

    excluded = await getExcludedClientIds(effectiveManager, 'withholding', monthlyKey);
    const forceIncluded = await getForceIncludedClientIds(effectiveManager, monthlyKey);

    const bizMap = new Map<string, string>();
    const monthlyTypesMap = new Map<string, IncomeTypeKey[]>();
    const employedTypesMap = new Map<string, IncomeTypeKey[]>();

    for (const c of targetClients) {
      const biz = normalizeBizNo(c.businessNo);
      if (biz) bizMap.set(c.id, biz);
      const types = readIncomeTypes(c.intakeData);
      const monthly: IncomeTypeKey[] = [];
      if (types.daily) monthly.push('daily');
      if (types.bizIncome) monthly.push('bizIncome');
      if (types.otherTax) monthly.push('otherTax');
      if (monthly.length) monthlyTypesMap.set(c.id, monthly);
      if (types.employed && employedKey) employedTypesMap.set(c.id, ['employed']);
    }

    const missingFromList = stillMissing;
    const extraCount = missingFromList.length;

    let checkedCells = 0;
    let skippedInactive = 0;
    if (monthlyTypesMap.size > 0 && filingTypeMap.size > 0) {
      const monthlyFilingTypes = filterSimplePayrollFilingTypes(filingTypeMap, [
        'daily',
        'bizIncome',
        'otherTax',
      ]);
      const monthlyResult = await matchSimplePayrollFromExcel(
        monthlyKey,
        monthlyFilingTypes,
        bizMap,
        monthlyTypesMap,
        user.name,
      );
      checkedCells += monthlyResult.checkedCells;
      skippedInactive += monthlyResult.skippedInactive;
    }
    if (employedKey && employedTypesMap.size > 0 && filingTypeMap.size > 0) {
      const employedFilingTypes = filterSimplePayrollFilingTypes(filingTypeMap, ['employed']);
      const employedResult = await matchSimplePayrollFromExcel(
        employedKey,
        employedFilingTypes,
        bizMap,
        employedTypesMap,
        user.name,
      );
      checkedCells += employedResult.checkedCells;
      skippedInactive += employedResult.skippedInactive;
    }

    const meta = simplePayrollPeriodMeta(body.periodKey);
    const periodKeys = meta.employedPeriodKey
      ? [meta.monthlyPeriodKey, meta.employedPeriodKey]
      : [meta.monthlyPeriodKey];
    const rowNotes = await getWithholdingRowNotesForPeriod(effectiveManager, meta.monthlyPeriodKey);
    const saved = await listSimplePayrollFilingsByKeys(periodKeys);
    const prevFiledKeys = await listSimplePayrollPrevFiledKeys(meta.year, meta.month);
    const { grid } = buildSimplePayrollGrid(
      clients,
      body.periodKey,
      saved,
      excluded,
      rowNotes,
      forceIncluded,
      prevFiledKeys,
      extraClientIds,
    );
    const stats = computeIncomeGridStats(grid, 'simplePayroll', manager);
    const unreceivedByColumn = listUnreceivedByColumn(grid, 'simplePayroll', manager);
    const noReceiptNames = listUnreceivedCompanyNames(grid, 'simplePayroll', manager);

    return NextResponse.json({
      matched: checkedCells,
      checkedCells,
      total: fileBizSet.size,
      parsedRows: parsedRows || filings.length,
      extraCount,
      missingFromList,
      noReceiptNames,
      unreceivedByColumn,
      addedNames,
      unmappedRows,
      skippedInactive,
      target: stats.target,
      received: stats.received,
      diff: stats.diff,
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser();
    const periodKey = request.nextUrl.searchParams.get('periodKey') ?? '';
    if (!periodKey) {
      return NextResponse.json({ error: 'periodKey required' }, { status: 400 });
    }

    const meta = simplePayrollPeriodMeta(periodKey);
    const keys = meta.employedPeriodKey
      ? [meta.monthlyPeriodKey, meta.employedPeriodKey]
      : [meta.monthlyPeriodKey];
    await resetSimplePayrollReceipt(keys);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
