// 블루홀 케이스 폼 메타 (진행상태/우선순위/의뢰경로/업무분류 2단)
//   GET → { statuses, priorities, requestRoutes, caseTypes }
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE = { headers: { 'Cache-Control': 'private, max-age=300' } };

export async function GET(_request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json({ error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' }, { status: 400 });
  }
  try {
    const meta = await withBluehole(user.id, (cookie) => bh.getCaseFormMeta(cookie));
    return NextResponse.json(meta, CACHE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '블루홀 호출 오류' }, { status: 500 });
  }
}
