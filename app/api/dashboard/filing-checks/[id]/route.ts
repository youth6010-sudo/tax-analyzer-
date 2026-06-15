import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { updateFilingCheck } from '@/lib/taxFilingDb';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      status?: 'pending' | 'done' | 'na';
      blueholeCaseId?: string;
      acceptanceCount?: number | null;
      notes?: string;
    };

    const acceptanceCount =
      body.acceptanceCount === null || body.acceptanceCount === undefined
        ? body.acceptanceCount
        : Number(body.acceptanceCount);

    const check = await updateFilingCheck(id, {
      ...body,
      acceptanceCount: acceptanceCount != null && Number.isNaN(acceptanceCount) ? null : acceptanceCount,
      checkedBy: body.status === 'done' ? user.name : undefined,
    });

    return NextResponse.json({ check });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
