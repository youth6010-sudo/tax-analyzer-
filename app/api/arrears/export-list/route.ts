import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canExportArrearsList } from '@/lib/arrearsAccess';
import { listArrearsEntries } from '@/lib/arrearsDb';
import {
  arrearsListExportFilename,
  buildArrearsListManagerTotals,
  buildArrearsListWorkbook,
  workbookToXlsxBuffer,
  type ArrearsListExportItem,
} from '@/lib/arrearsListExport';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

function parseMultiParam(sp: URLSearchParams, key: string): string[] {
  const all = sp.getAll(key).flatMap(v => v.split(',')).map(s => s.trim());
  return [...new Set(all.filter(Boolean))];
}

function parseCategoryParams(sp: URLSearchParams): string[] | undefined {
  const raw = sp.getAll('category').flatMap(v => v.split(','));
  if (raw.length === 0) return undefined;
  if (raw.some(v => v.trim() === 'all') && raw.length === 1) return undefined;
  const out: string[] = [];
  for (const v of raw) {
    const t = v.trim();
    if (!t || t === 'all') continue;
    if (t === 'none' || t === '__none__') out.push('');
    else out.push(t);
  }
  return out.length ? [...new Set(out)] : undefined;
}

function xlsxResponse(buf: Buffer, asOfDate: string) {
  const filename = arrearsListExportFilename(asOfDate);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function normalizeExportItems(raw: unknown): ArrearsListExportItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ArrearsListExportItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const companyName = String(r.companyName ?? '').trim();
    if (!companyName) continue;
    out.push({
      externalCode: String(r.externalCode ?? ''),
      companyName,
      balance: Math.round(Number(r.balance) || 0),
      reasonSummary: r.reasonSummary != null ? String(r.reasonSummary) : undefined,
      managerName: String(r.managerName ?? ''),
      mgmtCategory: String(r.mgmtCategory ?? ''),
      memo: String(r.memo ?? ''),
    });
  }
  return out;
}

/** 화면에서 넘긴 목록 → 색상 포함 엑셀 (DB 재조회 없음) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canExportArrearsList(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      items?: unknown;
      asOfDate?: string;
    };
    const items = normalizeExportItems(body.items);
    if (!items.length) {
      return NextResponse.json({ error: '내보낼 미수 목록이 없습니다.' }, { status: 400 });
    }

    const asOfDate = String(body.asOfDate ?? '').trim();
    const totalBalance = items.reduce((s, i) => s + i.balance, 0);
    const wb = await buildArrearsListWorkbook(items, {
      asOfDate,
      totalBalance,
      totalsByManager: buildArrearsListManagerTotals(items),
    });
    return xlsxResponse(await workbookToXlsxBuffer(wb), asOfDate);
  } catch (e) {
    return handleApiError(e);
  }
}

/** 미수관리 화면 목록(총미수) 요약 엑셀 — 관리자·인디·찰리만 (필터 재조회) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!canExportArrearsList(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sp = new URL(req.url).searchParams;
    const managers = parseMultiParam(sp, 'manager');
    const categories = parseCategoryParams(sp);
    const q = sp.get('q')?.trim() || undefined;
    const nonzero = sp.get('nonzero') === '1' || sp.get('nonzero') === 'true';
    const churnedOnly =
      sp.get('churned') === '1' ||
      sp.get('churned') === 'true' ||
      sp.get('churnedOnly') === '1';

    const result = await listArrearsEntries({
      managers: managers.length ? managers : undefined,
      categories,
      q,
      nonzero: nonzero || undefined,
      churnedOnly: churnedOnly || undefined,
      light: true,
    });

    const companies = [
      ...sp.getAll('company').flatMap(v => v.split('|')).map(s => s.trim()).filter(Boolean),
    ].filter((n, i, a) => a.indexOf(n) === i);
    const balances = [
      ...sp
        .getAll('balance')
        .flatMap(v => v.split(','))
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n)),
    ].filter((n, i, a) => a.indexOf(n) === i);
    const sort = sp.get('sort') === 'companyName' ? 'companyName' : 'balance';
    const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc';

    let items = result.items;
    if (companies.length) {
      const set = new Set(companies);
      items = items.filter(i => set.has(i.companyName.trim()));
    }
    if (balances.length) {
      const set = new Set(balances.map(b => Math.round(b)));
      items = items.filter(i => set.has(Math.round(i.balance)));
    }
    const sign = dir === 'asc' ? 1 : -1;
    items = [...items].sort((a, b) => {
      if (sort === 'companyName') {
        return a.companyName.localeCompare(b.companyName, 'ko') * sign;
      }
      const diff = Math.round(a.balance) - Math.round(b.balance);
      if (diff !== 0) return diff * sign;
      return a.companyName.localeCompare(b.companyName, 'ko');
    });

    const totalBalance = items.reduce((s, i) => s + i.balance, 0);
    const totalsByManager = buildArrearsListManagerTotals(items);

    if (!items.length) {
      return NextResponse.json({ error: '내보낼 미수 목록이 없습니다.' }, { status: 400 });
    }

    const wb = await buildArrearsListWorkbook(items, {
      asOfDate: result.asOfDate,
      totalBalance,
      totalsByManager,
    });
    return xlsxResponse(await workbookToXlsxBuffer(wb), result.asOfDate);
  } catch (e) {
    return handleApiError(e);
  }
}
