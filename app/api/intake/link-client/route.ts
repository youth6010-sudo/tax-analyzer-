import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { updateInquiry, updateProcessField } from '@/lib/consultationDb';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      inquiryId?: string;
      processId?: string | null;
      clientId?: string | null;
    };
    const { inquiryId, processId, clientId } = body;
    if (!inquiryId) {
      return NextResponse.json({ error: 'inquiryId가 필요합니다.' }, { status: 400 });
    }
    if (clientId === undefined) {
      return NextResponse.json({ error: 'clientId가 필요합니다.' }, { status: 400 });
    }

    const inquiry = await updateInquiry(
      inquiryId,
      { clientId },
      {
        name: user.name,
        loginId: user.loginId,
        role: user.role,
        adminMode: user.adminMode,
      },
    );
    let process = null;
    if (processId) {
      process = await updateProcessField(processId, { clientId });
    }

    return NextResponse.json({ inquiry, process });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (e instanceof Error && e.message === 'MANAGER_LOCKED') {
      return NextResponse.json(
        { error: '담당자 지정 후에는 해당 담당자만 변경할 수 있습니다.' },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
