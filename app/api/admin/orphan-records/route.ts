import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listOrphanRecords } from '@/lib/orphanRecordsDb';

export async function GET() {
  try {
    await requireAdmin();
    const records = await listOrphanRecords();
    return NextResponse.json(records);
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
