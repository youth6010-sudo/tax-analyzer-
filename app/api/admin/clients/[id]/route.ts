import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { deleteClientById } from '@/lib/clientsDb';
import { updateClientAsAdmin } from '@/lib/clientDuplicates';
import type { ClientPatch } from '@/lib/clientsDb';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as Partial<ClientPatch>;
    const client = await updateClientAsAdmin(id, body);
    return NextResponse.json({ client });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '업체명은 필수입니다.' }, { status: 400 });
    }
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const result = await deleteClientById(id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}