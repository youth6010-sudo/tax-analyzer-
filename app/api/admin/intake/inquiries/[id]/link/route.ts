import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { updateInquiry } from '@/lib/consultationDb';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as { clientId?: string | null };
    if (body.clientId === undefined) {
      return NextResponse.json({ error: 'clientId가 필요합니다.' }, { status: 400 });
    }
    const inquiry = await updateInquiry(id, { clientId: body.clientId });
    return NextResponse.json({ inquiry });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
