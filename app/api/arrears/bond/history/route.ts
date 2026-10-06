import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { readBondChangeLog, readBondDocLog, readBondNoticeDefaultsLog } from '@/lib/bondMgmtDb';

export const runtime = 'nodejs';

/** 채권관리 이력관리 창 — 단계별 변경 이력 + 발급 대장 + 일괄 날짜 이력 */
export async function GET() {
  try {
    await requireUser();
    const [changeLog, docLog, noticeDefaultsLog] = await Promise.all([
      readBondChangeLog(),
      readBondDocLog(),
      readBondNoticeDefaultsLog(),
    ]);
    return NextResponse.json(
      { changeLog, docLog, noticeDefaultsLog },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
