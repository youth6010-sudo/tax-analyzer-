import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { listArrearsEntries } from '@/lib/arrearsDb';
import { listLetterLines } from '@/lib/arrearsLetterDb';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { ARREARS_MANAGER_NAMES } from '@/app/types/arrears';
import {
  arrearsLetterExportFilename,
  buildArrearsLetterWorkbook,
  workbookToBuffer,
  type ArrearsLetterExportSheet,
} from '@/lib/arrearsLetterExport';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

type EntryLike = Awaited<ReturnType<typeof listArrearsEntries>>['items'][number];

async function sheetsForEntries(entries: EntryLike[]): Promise<ArrearsLetterExportSheet[]> {
  const sheets: ArrearsLetterExportSheet[] = [];
  for (const item of entries) {
    if (item.balance === 0) continue;
    const lines = await listLetterLines(item.id);
    if (!lines.length) continue;
    sheets.push({
      companyName: item.companyName,
      letterDate: item.letterDate || item.asOfDate || '',
      lines: lines.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
      })),
    });
  }
  return sheets;
}

function pickAsOf(sheets: ArrearsLetterExportSheet[], fallback = ''): string {
  return sheets.find(s => s.letterDate)?.letterDate || fallback;
}

/** 담당/필터 기준 미수수수료 안내 멀티시트 (기본 xls · 잔액≠0) */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const manager = sp.get('manager')?.trim() || undefined;
    const managers = [
      ...sp.getAll('manager').flatMap(v => v.split(',')).map(s => s.trim()).filter(Boolean),
    ].filter((n, i, a) => a.indexOf(n) === i);
    const categoryParam = sp.get('category');
    const categoriesRaw = sp.getAll('category').flatMap(v => v.split(','));
    let categories: string[] | undefined;
    if (categoriesRaw.length) {
      categories = [];
      for (const v of categoriesRaw) {
        const t = v.trim();
        if (!t || t === 'all') continue;
        if (t === 'none' || t === '__none__') categories.push('');
        else categories.push(t);
      }
      categories = [...new Set(categories)];
      if (!categories.length) categories = undefined;
    } else if (categoryParam != null && categoryParam !== 'all') {
      categories = [categoryParam];
    }
    const q = sp.get('q')?.trim() || undefined;
    const nonzero = sp.get('nonzero') !== '0' && sp.get('nonzero') !== 'false';
    const idsParam = sp.get('ids')?.trim();
    const byManager = sp.get('byManager') === '1' || sp.get('byManager') === 'true';
    const format = sp.get('format') === 'xlsx' ? 'xlsx' : 'xls';

    const canManage = canManageArrears(user);
    const managerNames = canManage
      ? undefined
      : getManagerMatchNames(user.name?.trim() || '');

    if (!canManage && (!managerNames || managerNames.length === 0)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { items } = await listArrearsEntries({
      managers: managers.length ? managers : manager ? [manager] : undefined,
      categories,
      q,
      nonzero: nonzero || undefined,
      managerNames,
    });

    let filtered = items.filter(i => i.balance !== 0);
    if (idsParam) {
      const idSet = new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean));
      filtered = filtered.filter(i => idSet.has(i.id));
    }

    /** 담당자별 파일 목록(메타) — UI에서 순차 다운로드 */
    if (byManager && managers.length === 0 && !manager && !idsParam) {
      const names = canManage
        ? [...ARREARS_MANAGER_NAMES]
        : (managerNames ?? []).filter(n =>
            (ARREARS_MANAGER_NAMES as readonly string[]).includes(n),
          );
      const files: { manager: string; count: number; filename: string }[] = [];
      for (const name of names) {
        const subset = filtered.filter(i => i.managerName === name);
        const sheets = await sheetsForEntries(subset);
        if (!sheets.length) continue;
        files.push({
          manager: name,
          count: sheets.length,
          filename: arrearsLetterExportFilename(
            name,
            pickAsOf(sheets, subset[0]?.letterDate || subset[0]?.asOfDate || ''),
            format,
          ),
        });
      }
      if (!files.length) {
        return NextResponse.json(
          { error: '내보낼 미수(잔액≠0·공문 내역 있음) 업체가 없습니다.' },
          { status: 400 },
        );
      }
      return NextResponse.json({ files, format });
    }

    const sheets = await sheetsForEntries(filtered);
    if (!sheets.length) {
      return NextResponse.json(
        { error: '내보낼 공문 내역이 없습니다. (잔액≠0 이고 공문 라인이 있는 거래처)' },
        { status: 400 },
      );
    }

    const wb = buildArrearsLetterWorkbook(sheets);
    const buf = await workbookToBuffer(wb, format);
    const asOf = pickAsOf(
      sheets,
      filtered[0]?.letterDate || filtered[0]?.asOfDate || '',
    );
    const filename = arrearsLetterExportFilename(manager || '전체', asOf, format);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
