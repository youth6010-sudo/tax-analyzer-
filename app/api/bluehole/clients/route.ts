// 블루홀 거래처 검색/조회 (수임처 연결용)
//   GET ?q=상호       → { clients: [{ id, name, business_number, branch_name, manager_name }] }
//   GET ?id=거래처ID  → { client: { id, name, business_number, manager, branch, ... } }
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }

  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json(
      { error: '블루홀 계정이 등록되어 있지 않습니다. 블루홀 페이지에서 계정을 먼저 등록하세요.', code: 'no_account' },
      { status: 400 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const id = (sp.get('id') || '').trim();
  const q = (sp.get('q') || '').trim();

  try {
    if (id) {
      const client = await withBluehole(user.id, (cookie) => bh.getClient(cookie, id));
      return NextResponse.json({ client }, NO_STORE);
    }
    if (!q) return NextResponse.json({ clients: [] }, NO_STORE);
    const clients = await withBluehole(user.id, (cookie) => bh.searchClients(cookie, q));
    return NextResponse.json({ clients }, NO_STORE);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '블루홀 호출 오류' },
      { status: 500 },
    );
  }
}
