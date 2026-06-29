// 수임처 값 → 블루홀 거래처 수정 반영 (Phase 2)
//   POST { changes: { <블루홀컬럼>: 값 } }  → updateInfo 후 결과(성공/실패 컬럼) + 변경 로그
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, getClientBlueholeId } from '@/lib/clientsDb';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { SYNCABLE_COLUMNS } from '@/lib/bluehole/clientFieldMap';
import { insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getClientById(id);
    assertCanAccessClient(user, existing);

    if (!(await blueholeConfiguredForUser(user.id))) {
      return NextResponse.json(
        { error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' },
        { status: 400 },
      );
    }

    const blueholeClientId = (await getClientBlueholeId(id)) || '';
    if (!blueholeClientId) {
      return NextResponse.json({ error: '연결된 블루홀 거래처가 없습니다.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { changes?: Record<string, unknown> };
    const raw = body.changes || {};
    const changes: Record<string, string> = {};
    for (const [col, val] of Object.entries(raw)) {
      if (SYNCABLE_COLUMNS.has(col)) changes[col] = val == null ? '' : String(val);
    }
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: '반영할 항목이 없습니다.' }, { status: 400 });
    }

    const result = (await withBluehole(user.id, (cookie) =>
      bh.updateClient(cookie, blueholeClientId, changes),
    )) as { success_cols?: string[]; warnings?: string[] };

    const successCols = result.success_cols || [];
    const warnings = result.warnings || [];

    await insertBlueholeSyncLog({
      clientId: id,
      blueholeClientId,
      action: 'update',
      userId: user.id,
      userName: user.name || '',
      changes,
      successCols,
      warnings,
    });

    return NextResponse.json({ successCols, warnings }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
