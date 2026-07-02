import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getClientRelatedCounts } from '@/lib/workbookDb';
import { listPersonalChecklistForClient } from '@/lib/personalChecklist';
import { getClientById } from '@/lib/clientsDb';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [related, checklistItems] = await Promise.all([
      getClientRelatedCounts(id, client.companyName),
      listPersonalChecklistForClient(id, { includeCompleted: false }),
    ]);

    return NextResponse.json({
      related,
      checklistItems,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
