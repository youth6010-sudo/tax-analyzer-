// 블루홀 케이스 단건 조회 (허브). 정규화 + 원본 일부.
//   GET → { case: { id, title, body, 거래처명, 수행자, ... } }
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json({ error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' }, { status: 400 });
  }
  const { id } = await params;
  try {
    const data = await withBluehole(user.id, (cookie) => bh.getCase(cookie, id));
    return NextResponse.json({ case: data }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '블루홀 호출 오류' }, { status: 500 });
  }
}
