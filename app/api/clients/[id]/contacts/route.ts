import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getClientById } from '@/lib/clientsDb';
import { createClientContact, listClientContacts } from '@/lib/clientContactsDb';
import type { ClientContactPayload } from '@/app/types/clientContact';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const contacts = await listClientContacts(id);
    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as ClientContactPayload;
    const contact = await createClientContact(id, body);
    return NextResponse.json({ contact });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
