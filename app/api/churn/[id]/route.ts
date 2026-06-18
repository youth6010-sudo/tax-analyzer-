import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { deleteChurnRecord, getChurnRecordById, updateChurnRecord } from '@/lib/clientsDb';
import type { ChurnRecordUpdatePayload } from '@/app/types/client';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getChurnRecordById(id);
    if (!existing) throw new Error('NOT_FOUND');
    assertCanAccessClient(user, {
      assignedUserId: existing.assignedUserId,
      manager: existing.manager,
    });
    const body = (await request.json()) as ChurnRecordUpdatePayload;
    const record = await updateChurnRecord(id, body);
    return NextResponse.json({ record });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getChurnRecordById(id);
    if (!existing) throw new Error('NOT_FOUND');
    assertCanAccessClient(user, {
      assignedUserId: existing.assignedUserId,
      manager: existing.manager,
    });
    await deleteChurnRecord(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
