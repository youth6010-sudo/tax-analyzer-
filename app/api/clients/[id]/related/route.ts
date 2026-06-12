import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getClientRelatedCounts } from '@/lib/workbookDb';
import { getClientById } from '@/lib/clientsDb';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const related = await getClientRelatedCounts(id, client.companyName);
    return NextResponse.json(related);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
