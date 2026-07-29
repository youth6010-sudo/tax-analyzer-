import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertClientExists } from '@/lib/clientAccess';
import { requireUser, isDataViewer } from '@/lib/auth';
import { ackClientNtsRestingAlert, getClientById } from '@/lib/clientsDb';
import { managerNamesMatch } from '@/app/utils/managerMatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

/** 휴업(02) 알림 확인 — 유출 등록 없이 닫기 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client);

    const manager = (client.manager || '').trim();
    const allowed =
      isDataViewer(user) ||
      !manager ||
      managerNamesMatch(manager, user.name);
    if (!allowed) {
      return NextResponse.json({ error: '담당자만 확인할 수 있습니다.' }, { status: 403, ...NO_STORE });
    }

    const result = await ackClientNtsRestingAlert(id);
    return NextResponse.json(result, NO_STORE);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'NOT_FOUND') {
        return NextResponse.json({ error: '수임처를 찾을 수 없습니다.' }, { status: 404, ...NO_STORE });
      }
      if (e.message.includes('휴업') || e.message.includes('유출')) {
        return NextResponse.json({ error: e.message }, { status: 400, ...NO_STORE });
      }
    }
    return handleApiError(e);
  }
}
