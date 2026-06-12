import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { registerClientFromIntake } from '@/lib/consultationDb';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { inquiryId?: string; processId?: string | null };
    if (!body.inquiryId) {
      return NextResponse.json({ error: 'inquiryId required' }, { status: 400 });
    }
    const client = await registerClientFromIntake(
      body.inquiryId,
      body.processId ?? null,
      user.id,
      user.name,
    );
    return NextResponse.json({ client }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '상세내용에서 업체명을 입력해 주세요.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
