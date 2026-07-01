import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canEditClient } from '@/lib/clientAccess';
import { getClientById, updateClientDetail } from '@/lib/clientsDb';
import { patchIncomeTypes, patchWithholdingSettings, readIncomeTypes, readWithholdingSettings } from '@/lib/incomeTypes';
import type { ClientIncomeTypes } from '@/app/types/incomeTypes';
import type { WithholdingSettings } from '@/app/types/incomeTypes';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      incomeTypes: readIncomeTypes(client.intakeData),
      withholdingSettings: readWithholdingSettings(client.intakeData),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canEditClient(user, client)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      incomeTypes?: Partial<ClientIncomeTypes>;
      withholdingSettings?: Partial<WithholdingSettings>;
    };

    let intakeData = client.intakeData ?? {};
    if (body.incomeTypes) {
      intakeData = patchIncomeTypes(intakeData, body.incomeTypes);
    }
    if (body.withholdingSettings) {
      intakeData = patchWithholdingSettings(intakeData, body.withholdingSettings);
    }

    const updated = await updateClientDetail(id, { intakeData });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      incomeTypes: readIncomeTypes(updated.intakeData),
      withholdingSettings: readWithholdingSettings(updated.intakeData),
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
