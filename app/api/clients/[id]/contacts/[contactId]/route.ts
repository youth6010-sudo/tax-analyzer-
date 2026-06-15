import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { deleteClientContact, updateClientContact } from '@/lib/clientContactsDb';
import type { ClientContactPayload } from '@/app/types/clientContact';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    await requireUser();
    const { id, contactId } = await params;
    const body = (await request.json()) as ClientContactPayload;
    const contact = await updateClientContact(id, contactId, body);
    return NextResponse.json({ contact });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    await requireUser();
    const { id, contactId } = await params;
    await deleteClientContact(id, contactId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
