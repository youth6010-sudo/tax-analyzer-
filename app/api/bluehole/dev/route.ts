// 블루홀 연동 MVP 라우트 (조회 전용 검증)
// GET /api/bluehole/dev?type=me|clients|client|cases|case&q=...&id=...
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }

  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json(
      {
        error: '블루홀 계정이 등록되어 있지 않습니다. 블루홀 페이지에서 계정을 먼저 등록하세요.',
      },
      { status: 400 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const type = sp.get('type') || 'clients';
  const q = sp.get('q') || '';
  const id = sp.get('id') || '';

  try {
    const data = await withBluehole(user.id, async (cookie) => {
      switch (type) {
        case 'me':
          return { me: await bh.getMyInfo(cookie) };
        case 'clients':
          return { clients: await bh.searchClients(cookie, q) };
        case 'client':
          return { client: await bh.getClient(cookie, id) };
        case 'cases':
          return await bh.listCases(cookie, { q, limit: 50 });
        case 'case':
          return { case: await bh.getCase(cookie, id) };
        default:
          throw new Error(`알 수 없는 type: ${type}`);
      }
    });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '블루홀 호출 오류' },
      { status: 500 },
    );
  }
}
