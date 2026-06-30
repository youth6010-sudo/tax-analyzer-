// 미연결 수임처 자동 연결 실행 (관리자 전용)
//   POST → { total, linked: [...], remaining: [...] }
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { autoLinkUnlinkedClients } from '@/lib/bluehole/autoLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json(
      { error: '블루홀 계정이 등록되어 있지 않습니다. 블루홀 페이지에서 계정을 먼저 등록하세요.', code: 'no_account' },
      { status: 400 },
    );
  }

  try {
    const result = await autoLinkUnlinkedClients(user.id, user.name || '');
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '자동 연결 실패' }, { status: 500 });
  }
}
