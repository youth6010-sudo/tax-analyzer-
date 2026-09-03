import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canApplyLeave } from '@/lib/leaveAccess';
import { getLeaveSubstituteOptions } from '@/lib/leaveDb';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!canApplyLeave(user)) {
      return NextResponse.json({ error: '연차 신청 대상이 아닙니다.' }, { status: 403 });
    }
    const url = new URL(req.url);
    const startDate = (url.searchParams.get('startDate') || '').trim();
    const endDate = (url.searchParams.get('endDate') || '').trim();
    if (!startDate || !endDate) {
      return NextResponse.json({ error: '기간을 입력하세요.' }, { status: 400 });
    }
    const options = await getLeaveSubstituteOptions(user.name, startDate, endDate);
    return NextResponse.json(options, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
