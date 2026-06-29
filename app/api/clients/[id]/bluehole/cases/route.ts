// 연결된 블루홀 거래처의 케이스(업무) 목록 조회 (Phase 4 — 읽기 통합)
//   GET → { cases: [...] }  (연결 안됨/계정 미등록이면 빈 목록 + 사유)
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, getClientBlueholeId } from '@/lib/clientsDb';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client);

    const blueholeClientId = (await getClientBlueholeId(id)) || '';
    if (!blueholeClientId) {
      return NextResponse.json({ cases: [], linked: false }, NO_STORE);
    }
    if (!(await blueholeConfiguredForUser(user.id))) {
      return NextResponse.json(
        { cases: [], error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' },
        NO_STORE,
      );
    }

    const data = (await withBluehole(user.id, (cookie) =>
      bh.listCases(cookie, { client_id: blueholeClientId, limit: 50 }),
    )) as { rows?: unknown[]; total?: number };

    return NextResponse.json({ cases: data.rows || [], total: data.total || 0, linked: true }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
