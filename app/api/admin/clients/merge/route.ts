import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { mergeClients } from '@/lib/clientDuplicates';

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { survivorId?: string; duplicateIds?: string[] };
    if (!body.survivorId || !body.duplicateIds?.length) {
      return NextResponse.json({ error: '정본 수임처와 병합 대상을 선택해 주세요.' }, { status: 400 });
    }
    const client = await mergeClients(body.survivorId, body.duplicateIds);
    return NextResponse.json({ client });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'NO_DUPLICATES') {
      return NextResponse.json({ error: '병합할 중복 항목이 없습니다.' }, { status: 400 });
    }
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
