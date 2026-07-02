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
  isSimplePayrollEmployedFilingMonth,
  parseSimplePayrollViewPeriod,
  simplePayrollMonthlyPeriodKey,
} from '@/lib/periodUtils';
import { filingTargets, normalizeBizNo } from '@/app/utils/filingCheck';
import { SIMPLE_PAYROLL_GRID_COLUMNS } from '@/app/types/incomeTypes';
import type { IncomeTypeKey } from '@/app/types/incomeTypes';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';

function sortGrid<T extends { douzoneCode: string; companyName: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ca = a.douzoneCode.replace(/\D/g, '');
    const cb = b.douzoneCode.replace(/\D/g, '');
    if (ca && cb) return parseInt(ca, 10) - parseInt(cb, 10);
    if (ca) return -1;
    if (cb) return 1;
    return a.companyName.localeCompare(b.companyName, 'ko');
  });
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

    const { year, month } = parseSimplePayrollViewPeriod(periodKey);
    const monthlyKey = simplePayrollMonthlyPeriodKey(year, month);
    const employedKey = employedSimplePayrollPeriodKey(year, month);
    const employedFilingMonth = isSimplePayrollEmployedFilingMonth(month);

    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
    });

    const baseTargets = filingTargets(clients, 'simplePayroll');
    const excluded = await getExcludedClientIds(manager, 'withholding', monthlyKey);

    const periodKeys = employedKey ? [monthlyKey, employedKey] : [monthlyKey];
    const saved = await listSimplePayrollFilingsByKeys(periodKeys);
    const filedMap = new Map(saved.map(r => [`${r.periodKey}|${r.clientId}|${r.incomeType}`, r]));

    const grid = sortGrid(
      baseTargets.map(c => {
          const types = readIncomeTypes(c.intakeData);
          const excludeReason = excluded[c.id] ?? null;
          const cells: Record<
            string,
            {
              active: boolean;
              applicable: boolean;
              filed: boolean;
              acceptanceDate: string;
              acceptanceMethod: string;
            }
          > = {};

          for (const col of SIMPLE_PAYROLL_GRID_COLUMNS) {
            if (col.kind === 'laborDate' || col.kind === 'laborMethod') continue;
            const key = col.key;
            const isEmployed = key === 'employed';
            const storageKey = isEmployed && employedKey ? employedKey : monthlyKey;
            const saved = filedMap.get(`${storageKey}|${c.id}|${key}`);
            const typeOn = types[key];
            const applicable = isEmployed ? employedFilingMonth : true;
            cells[key] = {
              applicable,
              active: typeOn && applicable,
              filed: saved?.filed ?? false,
              acceptanceDate: saved?.acceptanceDate ?? '',
              acceptanceMethod: saved?.acceptanceMethod ?? '',
            };
          }

          const laborSaved = filedMap.get(`${monthlyKey}|${c.id}|laborContentReport`);
          cells.laborContentReport = {
            applicable: true,
            active: types.laborContentReport,
            filed: laborSaved?.filed ?? false,
            acceptanceDate: laborSaved?.acceptanceDate ?? '',
            acceptanceMethod: laborSaved?.acceptanceMethod ?? '',
          };

          return {
            clientId: c.id,
            companyName: c.companyName,
            representative: c.representative,
            businessNo: c.businessNo,
            douzoneCode: getClientDouzoneCode(c) || '',
            manager: c.manager,
            excludeReason,
            cells,
          };
        }),
    );

    return NextResponse.json({
      year,
      month,
      monthlyPeriodKey: monthlyKey,
      employedPeriodKey: employedKey,
      employedFilingMonth,
      excluded,
      grid,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    let rows = body.rows;
    if (!rows && body.periodKey) {
      return NextResponse.json({ error: 'rows required' }, { status: 400 });
    }
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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { periodKey?: string; bizNos?: string[] };
    if (!body.periodKey || !body.bizNos) {
      return NextResponse.json({ error: 'periodKey, bizNos required' }, { status: 400 });
    }

    const { year, month } = parseSimplePayrollViewPeriod(body.periodKey);
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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
