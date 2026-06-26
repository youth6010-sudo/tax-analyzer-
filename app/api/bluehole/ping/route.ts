// 블루홀 연결 확인 — 저장된 자격증명으로 실제 로그인/내 정보 조회
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }

  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json(
      { error: '블루홀 계정이 등록되어 있지 않습니다.' },
      { status: 400 },
    );
  }

  try {
    const me = await withBluehole(user.id, (cookie) => bh.getMyInfo(cookie));
    const name = me?.name || me?.nickname || me?.login_id || me?.id || '(이름 미상)';
    return NextResponse.json({ ok: true, name }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '블루홀 연결 실패' },
      { status: 500 },
    );
  }
}
