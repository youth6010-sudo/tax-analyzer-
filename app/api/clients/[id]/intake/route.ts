import { NextResponse } from 'next/server';
import type { ContactUpdatePayload } from '@/app/types/contact';
import { requireUser } from '@/lib/auth';
import { completeIntake, updateClientIntake } from '@/lib/clientsDb';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      intakeStep?: number;
      intakeData?: Record<string, unknown>;
      patch?: Partial<ContactUpdatePayload>;
    };
    const client = await updateClientIntake(id, body);
    return NextResponse.json({ client });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await completeIntake(id, user.id);
    return NextResponse.json({ client });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '업체명을 입력해 주세요.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
