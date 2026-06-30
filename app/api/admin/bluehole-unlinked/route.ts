import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listBlueholeUnlinkedClients } from '@/lib/blueholeUnlinkedDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    const clients = await listBlueholeUnlinkedClients();
    return NextResponse.json({ clients });
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
