import { NextResponse } from 'next/server';
import { requireUser, isPortalAdmin } from '@/lib/auth';
import { churnClient, listClients } from '@/lib/clientsDb';

export async function GET() {
  try {
    const user = await requireUser();
    const clients = await listClients({
      status: 'active',
      mineOnly: !isPortalAdmin(user),
      userId: user.id,
      userName: user.name,
    });
    return NextResponse.json({ clients });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'ALREADY_HAS_RECORD') {
      return NextResponse.json({ error: '이미 유출 이력이 있습니다.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
