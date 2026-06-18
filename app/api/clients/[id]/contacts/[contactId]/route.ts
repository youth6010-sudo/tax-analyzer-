import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById } from '@/lib/clientsDb';
import { deleteClientContact, updateClientContact } from '@/lib/clientContactsDb';
import type { ClientContactPayload } from '@/app/types/clientContact';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, contactId } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);
    const body = (await request.json()) as ClientContactPayload;
    const contact = await updateClientContact(id, contactId, body);
    return NextResponse.json({ contact });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, contactId } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);
    await deleteClientContact(id, contactId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
