// 블루홀 전역 변경(감사) 로그 — 관리자 전용 (Phase 5)
//   GET ?limit=&offset= → { entries: [...], total }  (수임처 상호 포함)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listAllSyncLogs } from '@/lib/blueholeSyncDb';
import { getClientNamesByIds } from '@/lib/clientsDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const sp = request.nextUrl.searchParams;
    const limit = Number(sp.get('limit')) || 100;
    const offset = Number(sp.get('offset')) || 0;

    const { entries, total } = await listAllSyncLogs({ limit, offset });
    const names = await getClientNamesByIds(entries.map((e) => e.clientId));
    const withNames = entries.map((e) => ({ ...e, companyName: names.get(e.clientId) || '' }));

    return NextResponse.json(
      { entries: withNames, total, limit, offset },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
