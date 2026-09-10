import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { listManagerChangesSince } from '@/lib/clientManagerHistory';
import { listFilingCheckSessionsForPeriod } from '@/lib/taxFilingChecksDb';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

/** 담당 변경 이력 + (선택) 직전 신고분 세션 터치 — 원천 전월차이·담당 스코프용 */
export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const months = Math.min(36, Math.max(1, Number(searchParams.get('months')) || 18));
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const changes = await listManagerChangesSince(since);

    const prevPeriodKey = searchParams.get('prevPeriodKey')?.trim() || '';
    const taxType = searchParams.get('taxType')?.trim() || 'withholding';
    let prevSessions: Array<{ manager: string; data: unknown }> | undefined;
    if (prevPeriodKey) {
      prevSessions = await listFilingCheckSessionsForPeriod(taxType, prevPeriodKey);
    }

    return NextResponse.json({ changes, prevSessions }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
