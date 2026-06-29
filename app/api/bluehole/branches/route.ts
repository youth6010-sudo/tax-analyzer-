// 블루홀 지점 목록 + 내 프로필(소속 지점/팀) + 팀원 id (허브 지점 셀렉터/케이스 필터용)
//   GET → { branches: [{id,name}], me: {...}, team: [{id,name,nickname}] }
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

type BhUser = { id: string; name: string; nickname: string; branch_id: string };

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
    const { me, users } = await withBluehole(user.id, async (cookie) => {
      const [me, users] = await Promise.all([bh.getMyProfile(cookie), bh.listUsers(cookie)]);
      return { me, users };
    });

    const branchMap = new Map<string, string>();
    for (const u of users as BhUser[]) {
      if (u.branch_id && !branchMap.has(u.branch_id)) branchMap.set(u.branch_id, (u as BhUser & { branch_name: string }).branch_name);
    }
    const branches = [...branchMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    const team = (users as BhUser[])
      .filter((u) => u.branch_id && u.branch_id === me.branch_id)
      .map((u) => ({ id: u.id, name: u.name, nickname: u.nickname }));

    return NextResponse.json({ branches, me, team }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '블루홀 호출 오류' }, { status: 500 });
  }
}
