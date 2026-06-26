// 담당자 블루홀 계정 관리
//   GET    → 등록 상태 조회 (비밀번호 비노출)
//   PUT    → 계정 등록/갱신 (저장 전 로그인 검증)
//   DELETE → 계정 해제
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { verifyBlueholeLogin } from '@/lib/bluehole/server';
import {
  getUserBlueholeAccount,
  setUserBlueholeCreds,
  clearUserBlueholeCreds,
} from '@/lib/blueholeAuthDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  const account = await getUserBlueholeAccount(user.id);
  return NextResponse.json(account, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { loginId?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }

  const loginId = (body.loginId || '').trim();
  const password = body.password || '';
  if (!loginId || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 모두 입력하세요.' }, { status: 400 });
  }

  try {
    const result = await verifyBlueholeLogin(loginId, password);
    await setUserBlueholeCreds(user.id, loginId, password);
    return NextResponse.json({ ok: true, name: result.name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '블루홀 로그인 검증 실패' },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  await clearUserBlueholeCreds(user.id);
  return NextResponse.json({ ok: true });
}
