import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getInquiryById, updateInquiry, deleteIntakeInquiry, type InquiryPatch } from '@/lib/consultationDb';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const inquiry = await getInquiryById(id);
    return NextResponse.json({ inquiry });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as InquiryPatch;
    const inquiry = await updateInquiry(id, body, {
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      adminMode: user.adminMode,
    });
    return NextResponse.json({ inquiry });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    let processId: string | null = null;
    try {
      const body = (await request.json()) as { processId?: string | null };
      processId = body.processId ?? null;
    } catch {
      /* body 없음 */
    }
    await deleteIntakeInquiry(id, processId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
