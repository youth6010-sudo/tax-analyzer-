import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isMasterUser } from '@/lib/clientAccess';
import { listClients, updateClientDetail } from '@/lib/clientsDb';
import { patchYearEndTypes, readIncomeTypes, readYearEndTypes } from '@/lib/incomeTypes';
import {
  listYearEndFilings,
  matchYearEndFromExcel,
  resetYearEndReceipt,
  upsertYearEndFilings,
  YEAR_END_TABLE_TYPES,
  type YearEndIncomeType,
} from '@/lib/yearEndFilingsDb';
import { listSimplePayrollFiledTypesByYear } from '@/lib/simplePayrollFilingsDb';
import { YEAR_END_COLUMNS } from '@/app/types/incomeTypes';
import type { YearEndIncomeKey } from '@/app/types/incomeTypes';
import {
  buildYearEndGrid,
  computeIncomeGridStats,
  listUnreceivedByColumn,
  listUnreceivedCompanyNames,
  yearEndColumnActive,
} from '@/lib/incomeTypeFilingGrid';
import {
  buildYearEndFilingTypeMap,
  filingTargets,
  normalizeBizNo,
  type HometaxFiling,
} from '@/app/utils/filingCheck';
import {
  getWithholdingExclusionsForYear,
  getWithholdingRowNotesForYear,
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

    // 간이지급 incomeTypes는 월별로 켜고 끔 — 연말 표시는 같은 해 접수 이력(OR)로만 판단
    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
    });

    const saved = await listYearEndFilings(year);
    const yearExcluded = await getWithholdingExclusionsForYear(manager, year);
    const rowNotes = await getWithholdingRowNotesForYear(manager, year);
    const yearSimpleFiled = await listSimplePayrollFiledTypesByYear(year);

    const grid = buildYearEndGrid(clients, year, saved, yearExcluded, rowNotes, yearSimpleFiled);

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
    const body = (await request.json()) as {
      year?: number;
      bizNos?: string[];
      filings?: HometaxFiling[];
      manager?: string;
    };
    if (!body.year) {
      return NextResponse.json({ error: 'year required' }, { status: 400 });
    }
    const filings = body.filings ?? [];
    if (filings.length === 0 && (!body.bizNos || body.bizNos.length === 0)) {
      return NextResponse.json({ error: 'filings or bizNos required' }, { status: 400 });
    }

    const manager = body.manager ?? user.name;
    const effectiveManager = manager === '전체' ? user.name : manager;

    const clients = await listClients({
      mineOnly: !isMasterUser(user),
      userId: user.id,
      userName: user.name,
    });

    let yearExcluded = await getWithholdingExclusionsForYear(effectiveManager, body.year);
    const yearSimpleFiled = await listSimplePayrollFiledTypesByYear(body.year);
    let saved = await listYearEndFilings(body.year);

    const targetClients = filingTargets(clients, 'yearEnd');
    const clientByBiz = new Map<string, (typeof targetClients)[0]>();
    for (const c of targetClients) {
      const biz = normalizeBizNo(c.businessNo);
      if (biz.length === 10 && !clientByBiz.has(biz)) clientByBiz.set(biz, c);
    }

    const { map: filingTypeMap, unmappedRows, parsedRows } = buildYearEndFilingTypeMap(filings);
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

    const YEAR_END_SHARED = new Set<YearEndIncomeKey>(['employed', 'bizIncome', 'otherTax']);
    const addedNames: string[] = [];
    const stillMissing: string[] = [];

    for (const biz of fileBizSet) {
      const client = clientByBiz.get(biz);
      const displayName = client?.companyName || uploadNameByBiz.get(biz) || biz;
      if (!client) {
        stillMissing.push(displayName);
        continue;
      }

      // 근로·사업·기타는 간이지급 월별 설정/접수 이력으로만 표시 — incomeTypes를 다시 켜지 않음
      // 퇴직·이자배당만 연말 전용 설정 활성화
      const receiptTypes = filingTypeMap.get(biz);
      if (receiptTypes && receiptTypes.size > 0) {
        const yearEndTypes = readYearEndTypes(client.intakeData);
        const yearEndPatch: Partial<Record<YearEndIncomeKey, boolean>> = {};
        for (const t of receiptTypes) {
          if (YEAR_END_SHARED.has(t)) continue;
          if (!yearEndTypes[t]) yearEndPatch[t] = true;
        }
        if (Object.keys(yearEndPatch).length > 0) {
          const nextIntake = patchYearEndTypes(
            (client.intakeData ?? {}) as Record<string, unknown>,
            yearEndPatch,
          );
          await updateClientDetail(client.id, { intakeData: nextIntake });
          client.intakeData = nextIntake;
          addedNames.push(displayName);
        }
      }
    }

    yearExcluded = await getWithholdingExclusionsForYear(effectiveManager, body.year);
    saved = await listYearEndFilings(body.year);
    const yearEndFiledByClient = new Map<string, Set<YearEndIncomeType>>();
    for (const r of saved) {
      if (!r.filed) continue;
      let set = yearEndFiledByClient.get(r.clientId);
      if (!set) {
        set = new Set();
        yearEndFiledByClient.set(r.clientId, set);
      }
      set.add(r.incomeType);
    }

    const bizMap = new Map<string, string>();
    const typesMap = new Map<string, YearEndIncomeType[]>();

    for (const c of targetClients) {
      const biz = normalizeBizNo(c.businessNo);
      if (biz) bizMap.set(c.id, biz);
      const incomeTypes = readIncomeTypes(c.intakeData);
      const yearEndTypes = readYearEndTypes(c.intakeData);
      const simpleFiled = yearSimpleFiled.get(c.id);
      const yeFiled = yearEndFiledByClient.get(c.id);
      const receiptTypes = biz ? filingTypeMap.get(biz) : undefined;
      const active: YearEndIncomeType[] = [];
      for (const { key } of YEAR_END_TABLE_TYPES) {
        if (
          yearEndColumnActive(key, incomeTypes, yearEndTypes, simpleFiled) ||
          yeFiled?.has(key) ||
          receiptTypes?.has(key)
        ) {
          active.push(key);
        }
      }
      if (active.length) typesMap.set(c.id, active);
    }

    const missingFromList = stillMissing;
    const extraCount = missingFromList.length;

    let checkedCells = 0;
    let skippedInactive = 0;
    if (typesMap.size > 0 && filingTypeMap.size > 0) {
      const result = await matchYearEndFromExcel(
        body.year,
        filingTypeMap,
        bizMap,
        typesMap,
        user.name,
      );
      checkedCells = result.checkedCells;
      skippedInactive = result.skippedInactive;
    }

    const rowNotes = await getWithholdingRowNotesForYear(effectiveManager, body.year);
    const savedAfter = await listYearEndFilings(body.year);
    const grid = buildYearEndGrid(
      clients,
      body.year,
      savedAfter,
      yearExcluded,
      rowNotes,
      yearSimpleFiled,
    );
    const stats = computeIncomeGridStats(grid, 'yearEnd', manager);
    const unreceivedByColumn = listUnreceivedByColumn(grid, 'yearEnd', manager);
    const noReceiptNames = listUnreceivedCompanyNames(grid, 'yearEnd', manager);

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
    const year = Number(request.nextUrl.searchParams.get('year'));
    if (!year) {
      return NextResponse.json({ error: 'year required' }, { status: 400 });
    }
    await resetYearEndReceipt(year);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
