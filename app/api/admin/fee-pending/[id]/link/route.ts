import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { linkFeeImportPending } from '@/lib/feeImportPendingDb';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as { clientId?: string };
    if (!body.clientId?.trim()) {
      return NextResponse.json({ error: 'clientId가 필요합니다.' }, { status: 400 });
    }
    const result = await linkFeeImportPending(id, body.clientId.trim(), admin.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'CLIENT_NOT_FOUND') {
      return NextResponse.json({ error: '수임처를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
