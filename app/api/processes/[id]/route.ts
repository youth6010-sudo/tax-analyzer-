import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { updateProcessChecklist, updateProcessField } from '@/lib/consultationDb';
import type { ChecklistKey } from '@/app/types/intake';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      checklist?: Record<string, boolean | string | string[]>;
      toggledKey?: ChecklistKey;
      blueholeCode?: string;
      companyName?: string;
      monthlyFee?: number | null;
      feeStartDate?: string;
      channel?: string;
    };

    if (body.checklist) {
      const row = await updateProcessChecklist(id, body.checklist, {
        toggledKey: body.toggledKey,
        actorName: user.name,
        blueholeCode: body.blueholeCode,
      });
      return NextResponse.json({ process: row });
    }

    const row = await updateProcessField(id, {
      companyName: body.companyName,
      monthlyFee: body.monthlyFee,
      feeStartDate: body.feeStartDate,
      channel: body.channel,
    });
    return NextResponse.json({ process: row });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
