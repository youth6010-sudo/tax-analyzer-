import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient, assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById } from '@/lib/clientsDb';
import { createClientContact, listClientContacts } from '@/lib/clientContactsDb';
import type { ClientContactPayload } from '@/app/types/clientContact';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client); // 조회는 전체 허용
    const contacts = await listClientContacts(id);
    return NextResponse.json({ contacts });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);
    const body = (await request.json()) as ClientContactPayload;
    const contact = await createClientContact(id, body);
    return NextResponse.json({ contact });
  } catch (e) {
    return handleApiError(e);
  }
}
