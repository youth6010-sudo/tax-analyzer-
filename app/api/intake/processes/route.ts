import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createIntakeProcess } from '@/lib/consultationDb';
import { listIntakeProcesses } from '@/lib/workbookDb';

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ items: await listIntakeProcesses() });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as {
      companyName?: string;
      clientId?: string | null;
      feeStartDate?: string;
      monthlyFee?: number | null;
      channel?: string;
    };
    const process = await createIntakeProcess({
      companyName: body.companyName ?? '',
      clientId: body.clientId,
      feeStartDate: body.feeStartDate,
      monthlyFee: body.monthlyFee,
      channel: body.channel,
    });
    return NextResponse.json({ process }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '업체명은 필수입니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
