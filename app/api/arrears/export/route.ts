import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { listArrearsEntries } from '@/lib/arrearsDb';
import { listLetterLines } from '@/lib/arrearsLetterDb';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import {
  arrearsLetterExportFilename,
  buildArrearsLetterWorkbook,
  workbookToBuffer,
  type ArrearsLetterExportSheet,
} from '@/lib/arrearsLetterExport';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

/** 담당/필터 기준 미수수수료 안내 멀티시트 xlsx */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const manager = sp.get('manager')?.trim() || undefined;
    const categoryParam = sp.get('category');
    const category =
      categoryParam == null || categoryParam === 'all' ? undefined : categoryParam;
    const q = sp.get('q')?.trim() || undefined;
    const nonzero = sp.get('nonzero') !== '0' && sp.get('nonzero') !== 'false';
    const idsParam = sp.get('ids')?.trim();

    const canManage = canManageArrears(user);
    const managerNames = canManage
      ? undefined
      : getManagerMatchNames(user.name?.trim() || '');

    if (!canManage && (!managerNames || managerNames.length === 0)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { items } = await listArrearsEntries({
      manager,
      category,
      q,
      nonzero: nonzero || undefined,
      managerNames,
    });

    let filtered = items;
    if (idsParam) {
      const idSet = new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean));
      filtered = items.filter(i => idSet.has(i.id));
    }

    // 안내서에 넣을 항목: 라인 있거나 잔액≠0
    const sheets: ArrearsLetterExportSheet[] = [];
    for (const item of filtered) {
      const lines = await listLetterLines(item.id);
      if (!lines.length && item.balance === 0) continue;
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

    if (!sheets.length) {
      return NextResponse.json(
        { error: '내보낼 공문 내역이 없습니다. (잔액≠0 이거나 공문 라인이 있는 거래처)' },
        { status: 400 },
      );
    }

    const wb = buildArrearsLetterWorkbook(sheets);
    const buf = workbookToBuffer(wb);
    const asOf =
      sheets.find(s => s.letterDate)?.letterDate ||
      filtered[0]?.letterDate ||
      filtered[0]?.asOfDate ||
      '';
    const filename = arrearsLetterExportFilename(manager || '전체', asOf);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
