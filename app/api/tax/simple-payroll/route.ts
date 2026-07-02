import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isMasterUser } from '@/lib/clientAccess';
import { listClients } from '@/lib/clientsDb';
import { readIncomeTypes } from '@/lib/incomeTypes';
import {
  listSimplePayrollFilingsByKeys,
  matchSimplePayrollFromExcel,
  upsertSimplePayrollFilings,
} from '@/lib/simplePayrollFilingsDb';
import { getExcludedClientIds } from '@/lib/taxFilingChecksDb';
import {
  employedSimplePayrollPeriodKey,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';
import { buildSimplePayrollGrid, simplePayrollPeriodMeta } from '@/lib/incomeTypeFilingGrid';
import { filingTargets, normalizeBizNo } from '@/app/utils/filingCheck';
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
    });

    const excluded = await getExcludedClientIds(manager, 'withholding', monthlyPeriodKey);
    const periodKeys = employedPeriodKey ? [monthlyPeriodKey, employedPeriodKey] : [monthlyPeriodKey];
    const saved = await listSimplePayrollFilingsByKeys(periodKeys);
    const { grid } = buildSimplePayrollGrid(clients, periodKey, saved, excluded);

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
          notes: '',
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
    const body = (await request.json()) as { periodKey?: string; bizNos?: string[] };
    if (!body.periodKey || !body.bizNos) {
      return NextResponse.json({ error: 'periodKey, bizNos required' }, { status: 400 });
    }

    const { year, month } = simplePayrollPeriodMeta(body.periodKey);
    const monthlyKey = simplePayrollMonthlyPeriodKey(year, month);
    const employedKey = employedSimplePayrollPeriodKey(year, month);

    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
    });

    const bizMap = new Map<string, string>();
    const monthlyTypesMap = new Map<string, IncomeTypeKey[]>();
    const employedTypesMap = new Map<string, IncomeTypeKey[]>();

    for (const c of filingTargets(clients, 'simplePayroll')) {
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

    let matched = 0;
    if (monthlyTypesMap.size > 0) {
      matched += await matchSimplePayrollFromExcel(
        monthlyKey,
        body.bizNos,
        bizMap,
        monthlyTypesMap,
        user.name,
      );
    }
    if (employedKey && employedTypesMap.size > 0) {
      matched += await matchSimplePayrollFromExcel(
        employedKey,
        body.bizNos,
        bizMap,
        employedTypesMap,
        user.name,
      );
    }

    return NextResponse.json({ matched });
  } catch (e) {
    return apiError(e);
  }
}
