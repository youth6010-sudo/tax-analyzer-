// 수임처 ↔ 블루홀 거래처 연결 상태/연결/해제
//   GET    → { blueholeClientId, linked, configured, info?, infoError?, deeplink? }
//   POST   { blueholeClientId | input }  → 블루홀에서 존재 확인 후 연결
//   DELETE → 연결 해제
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient, assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, getClientBlueholeId, setClientBlueholeId } from '@/lib/clientsDb';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { getLastSyncForClient, insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };
const deeplinkOf = (bhId: string) => (bhId ? `https://bluehole.world/client/info/${bhId}` : '');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client);

    const blueholeClientId = (await getClientBlueholeId(id)) || '';
    const configured = await blueholeConfiguredForUser(user.id);

    if (!blueholeClientId) {
      return NextResponse.json({ blueholeClientId: '', linked: false, configured }, NO_STORE);
    }

    // 기본 응답은 블루홀 릴레이를 호출하지 않는다(릴레이가 느려 상세 진입이 지연됨).
    // 실시간 정보(info)는 ?live=1 일 때만 조회 — 패널이 연결 상태를 먼저 그린 뒤 백그라운드로 가져온다.
    const wantLive = request.nextUrl.searchParams.get('live') === '1';
    if (!wantLive) {
      return NextResponse.json(
        { blueholeClientId, linked: true, configured, deeplink: deeplinkOf(blueholeClientId) },
        NO_STORE,
      );
    }

    let info: unknown = null;
    let infoError: string | undefined;
    if (configured) {
      try {
        info = await withBluehole(user.id, (cookie) => bh.getClient(cookie, blueholeClientId));
      } catch (e) {
        infoError = e instanceof Error ? e.message : '블루홀 정보 조회 실패';
      }
    }

    const lastSync = await getLastSyncForClient(id);

    return NextResponse.json(
      { blueholeClientId, linked: true, configured, info, infoError, lastSync, deeplink: deeplinkOf(blueholeClientId) },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getClientById(id);
    assertCanAccessClient(user, existing);

    if (!(await blueholeConfiguredForUser(user.id))) {
      return NextResponse.json(
        { error: '블루홀 계정이 등록되어 있지 않습니다. 블루홀 페이지에서 계정을 먼저 등록하세요.', code: 'no_account' },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { blueholeClientId?: string; input?: string };
    const raw = (body.blueholeClientId || body.input || '').toString();
    const bhId = bh.parseClientId(raw);
    if (!bhId) {
      return NextResponse.json({ error: '연결할 블루홀 거래처 ID(또는 주소)를 확인하세요.' }, { status: 400 });
    }

    // 존재 확인 + 정보 회수
    const info = await withBluehole(user.id, (cookie) => bh.getClient(cookie, bhId));
    if (!info || !info.id) {
      return NextResponse.json({ error: '해당 ID의 블루홀 거래처를 찾을 수 없습니다.' }, { status: 404 });
    }

    await setClientBlueholeId(id, bhId);
    await insertBlueholeSyncLog({
      clientId: id,
      blueholeClientId: bhId,
      action: 'link',
      userId: user.id,
      userName: user.name || '',
      changes: { name: (info && info.name) || '' },
      successCols: [],
      warnings: [],
    });
    return NextResponse.json(
      { blueholeClientId: bhId, linked: true, configured: true, info, deeplink: deeplinkOf(bhId) },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getClientById(id);
    assertCanAccessClient(user, existing);
    const prevBhId = (await getClientBlueholeId(id)) || '';
    await setClientBlueholeId(id, '');
    if (prevBhId) {
      await insertBlueholeSyncLog({
        clientId: id,
        blueholeClientId: prevBhId,
        action: 'unlink',
        userId: user.id,
        userName: user.name || '',
        changes: {},
        successCols: [],
        warnings: [],
      });
    }
    return NextResponse.json({ blueholeClientId: '', linked: false }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
