import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { updateChurnRecord } from '@/lib/clientsDb';
import type { ChurnRecordUpdatePayload } from '@/app/types/client';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const body = (await request.json()) as ChurnRecordUpdatePayload;
    const record = await updateChurnRecord(id, body);
    return NextResponse.json({ record });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
