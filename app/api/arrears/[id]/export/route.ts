import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears, canViewArrearsRow } from '@/lib/arrearsAccess';
import { getArrearsLetterDetail } from '@/lib/arrearsLetterDb';
import {
  arrearsLetterExportFilename,
  buildArrearsLetterWorkbook,
  workbookToBuffer,
} from '@/lib/arrearsLetterExport';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const detail = await getArrearsLetterDetail(id);
    if (!detail) {
      return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canViewArrearsRow(user, detail.item.managerName)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const wb = buildArrearsLetterWorkbook([
      {
        companyName: detail.item.companyName,
        letterDate: detail.item.letterDate || detail.item.asOfDate || '',
        lines: detail.lines.map(l => ({
          description: l.description,
          amount: l.amount,
          paidAmount: l.paidAmount,
          paidDate: l.paidDate,
        })),
      },
    ]);
    const buf = workbookToBuffer(wb);
    const filename = arrearsLetterExportFilename(
      detail.item.managerName || '안내',
      detail.item.letterDate || detail.item.asOfDate || '',
    ).replace(/^미수수수료_/, `미수수수료_${detail.item.companyName || '업체'}_`);

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
