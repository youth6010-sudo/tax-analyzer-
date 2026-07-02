import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isMasterUser } from '@/lib/clientAccess';
import { listClients } from '@/lib/clientsDb';
import { readIncomeTypes, yearEndTypeTargets } from '@/lib/incomeTypes';
import {
  listYearEndFilings,
  matchYearEndFromExcel,
  upsertYearEndFilings,
  YEAR_END_TABLE_TYPES,
  type YearEndIncomeType,
} from '@/lib/yearEndFilingsDb';
import { YEAR_END_COLUMNS } from '@/app/types/incomeTypes';
import { buildYearEndGrid } from '@/lib/incomeTypeFilingGrid';
import { filingTargets, normalizeBizNo } from '@/app/utils/filingCheck';
import {
  getWithholdingExclusionsForYear,
  getWithholdingReceiptHistoryForYear,
} from '@/lib/taxFilingChecksDb';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[year-end]', e);
  const message = e instanceof Error ? e.message : 'Server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const year = Number(searchParams.get('year')) || new Date().getFullYear();
    const manager = searchParams.get('manager') ?? user.name;

    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
    });

    const saved = await listYearEndFilings(year);
    const yearExcluded = await getWithholdingExclusionsForYear(manager, year);
    const { ids, bizNos } = await getWithholdingReceiptHistoryForYear(
      manager,
      year,
      normalizeBizNo,
    );

    const grid = buildYearEndGrid(clients, year, saved, yearExcluded, { ids, bizNos });

    const tables: Record<
      YearEndIncomeType,
      {
        label: string;
        rows: {
          clientId: string;
          companyName: string;
          representative: string;
          businessNo: string;
          filed: boolean;
        }[];
      }
    > = {} as never;

    for (const { key, label } of YEAR_END_TABLE_TYPES) {
      tables[key] = { label, rows: [] };
    }

    for (const row of grid) {
      for (const { key } of YEAR_END_COLUMNS) {
        const cell = row.cells[key];
        if (!cell?.active) continue;
        tables[key as YearEndIncomeType].rows.push({
          clientId: row.clientId,
          companyName: row.companyName,
          representative: row.representative,
          businessNo: row.businessNo,
          filed: cell.filed,
        });
      }
    }

    return NextResponse.json({ year, grid, tables });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      year?: number;
      rows?: { clientId: string; incomeType: YearEndIncomeType; filed: boolean }[];
    };

    if (!body.year || !body.rows) {
      return NextResponse.json({ error: 'year, rows required' }, { status: 400 });
    }

    await upsertYearEndFilings(
      body.year,
      body.rows.map(r => ({ ...r, notes: '' })),
      user.name,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { year?: number; bizNos?: string[] };
    if (!body.year || !body.bizNos) {
      return NextResponse.json({ error: 'year, bizNos required' }, { status: 400 });
    }

    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
    });

    const bizMap = new Map<string, string>();
    const typesMap = new Map<string, YearEndIncomeType[]>();
    for (const c of filingTargets(clients, 'yearEnd')) {
      const biz = normalizeBizNo(c.businessNo);
      if (biz) bizMap.set(c.id, biz);
      const t = yearEndTypeTargets(readIncomeTypes(c.intakeData));
      const active: YearEndIncomeType[] = [];
      for (const { key } of YEAR_END_TABLE_TYPES) {
        if (t[key]) active.push(key);
      }
      if (active.length) typesMap.set(c.id, active);
    }

    const matched = await matchYearEndFromExcel(body.year, body.bizNos, bizMap, typesMap, user.name);
    return NextResponse.json({ matched });
  } catch (e) {
    return apiError(e);
  }
}
