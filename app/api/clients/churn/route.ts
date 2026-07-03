import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser, isDataViewer } from '@/lib/auth';
import { churnClient, getClientById, listClients } from '@/lib/clientsDb';

export async function GET() {
  try {
    const user = await requireUser();
    const clients = await listClients({
      status: 'active',
      mineOnly: !isDataViewer(user),
      userId: user.id,
      userName: user.name,
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      clientId?: string;
      reason?: string;
      detail?: string;
      churnedAt?: string;
      feeAmount?: number | null;
      dataCleanup?: string;
      churnType?: string;
      earlySign?: string;
      manager?: string;
    };
    if (!body.clientId || !body.reason?.trim()) {
      return NextResponse.json({ error: '수임처와 유출 사유를 입력해 주세요.' }, { status: 400 });
    }
    const existing = await getClientById(body.clientId);
    assertCanAccessClient(user, existing);
    const client = await churnClient(
      body.clientId,
      {
        reason: body.reason.trim(),
        detail: body.detail?.trim(),
        churnedAt: body.churnedAt,
        feeAmount: body.feeAmount,
        dataCleanup: body.dataCleanup,
        churnType: body.churnType,
        earlySign: body.earlySign,
        manager: body.manager,
      },
      user.id,
    );
    return NextResponse.json({ client });
  } catch (e) {
    if (e instanceof Error && e.message === 'ALREADY_HAS_RECORD') {
      return NextResponse.json({ error: '이미 유출 이력이 있습니다.' }, { status: 409 });
    }
    return handleApiError(e);
  }
}
