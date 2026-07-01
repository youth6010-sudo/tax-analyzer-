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
import { filingTargets, normalizeBizNo } from '@/app/utils/filingCheck';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import { getFilingCheckSession, getWithholdingExclusionsForYear } from '@/lib/taxFilingChecksDb';

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

    const base = filingTargets(clients, 'yearEnd');
    const saved = await listYearEndFilings(year);
    const filedMap = new Map(saved.map(r => [`${r.clientId}|${r.incomeType}`, r]));
    const yearExcluded = await getWithholdingExclusionsForYear(manager, year);

    const withheldIds = new Set<string>();
    const withheldBiz = new Set<string>();
    for (let m = 1; m <= 12; m += 1) {
      const pk = `${year}-${String(m).padStart(2, '0')}`;
      const session = await getFilingCheckSession(manager, 'withholding', pk);
      if (!session) continue;
      for (const b of session.excelBizNos ?? []) withheldBiz.add(normalizeBizNo(b));
      for (const [id, v] of Object.entries(session.overrides ?? {})) if (v) withheldIds.add(id);
    }

    const grid = base
      .filter(c => {
        const biz = normalizeBizNo(c.businessNo);
        return withheldIds.has(c.id) || (biz !== '' && withheldBiz.has(biz));
      })
      .map(c => {
        const types = yearEndTypeTargets(readIncomeTypes(c.intakeData));
        const excludeReason = yearExcluded[c.id] ?? null;
        const cells: Record<string, { active: boolean; filed: boolean }> = {};
        for (const col of YEAR_END_COLUMNS) {
          const active = types[col.key as YearEndIncomeType];
          const savedRow = filedMap.get(`${c.id}|${col.key}`);
          cells[col.key] = {
            active,
            filed: savedRow?.filed ?? false,
          };
        }
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
      })
      .sort((a, b) => {
        const ca = a.douzoneCode.replace(/\D/g, '');
        const cb = b.douzoneCode.replace(/\D/g, '');
        if (ca && cb) return parseInt(ca, 10) - parseInt(cb, 10);
        if (ca) return -1;
        if (cb) return 1;
        return a.companyName.localeCompare(b.companyName, 'ko');
      });

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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
