import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isMasterUser } from '@/lib/clientAccess';
import { getExcludedClientIds } from '@/lib/taxFilingChecksDb';

/** 대시보드 — 신고대상확인 제외 목록 실시간 조회 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const taxType = searchParams.get('taxType') ?? '';
    const periodKey = searchParams.get('periodKey') ?? '';
    const manager = searchParams.get('manager') ?? user.name;

    if (!taxType || !periodKey) {
      return NextResponse.json({ error: 'taxType, periodKey required' }, { status: 400 });
    }

    if (!isMasterUser(user) && manager !== user.name) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const excluded = await getExcludedClientIds(manager, taxType, periodKey);
    return NextResponse.json({ excluded });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
