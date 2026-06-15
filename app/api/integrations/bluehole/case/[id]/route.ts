import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fetchBlueholeCase, isBlueholeApiEnabled } from '@/lib/integrations/bluehole/client';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireUser();
    const { id } = await context.params;
    const caseSummary = await fetchBlueholeCase(id);
    return NextResponse.json({
      case: caseSummary,
      apiEnabled: isBlueholeApiEnabled(),
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: '케이스를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'INVALID_CASE_ID') {
      return NextResponse.json({ error: '케이스 번호가 올바르지 않습니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
