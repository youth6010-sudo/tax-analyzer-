// 블루홀 케이스 목록/검색 (허브). 기본은 로그인 계정 권한 기준(내 지점/팀).
//   GET [?q=제목][&assignedBy=수행자id][&clientId][&limit] → { rows: [...], total }
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
    return NextResponse.json({ error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  const assignedBy = (sp.get('assignedBy') || '').trim();
  const clientId = (sp.get('clientId') || '').trim();
  const statusCode = (sp.get('status') || '').trim();
  const limit = Math.min(Number(sp.get('limit')) || 500, 2000);

  const filters: Record<string, string | number> = { limit };
  if (q) filters.q = q;
  if (assignedBy) filters.assigned_by = assignedBy;
  if (clientId) filters.client_id = clientId;
  if (statusCode) filters.status_code = statusCode;

  try {
    const data = (await withBluehole(user.id, (cookie) => bh.listCases(cookie, filters))) as {
      rows?: unknown[];
      total?: number;
    };
    return NextResponse.json({ rows: data.rows || [], total: data.total || 0 }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '블루홀 호출 오류' }, { status: 500 });
  }
}
