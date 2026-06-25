import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listFeeImportPending } from '@/lib/feeImportPendingDb';

export async function GET() {
  try {
    await requireAdmin();
    const items = await listFeeImportPending();
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
