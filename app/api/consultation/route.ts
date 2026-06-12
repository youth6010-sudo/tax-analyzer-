import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createConsultation } from '@/lib/consultationDb';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      data?: Record<string, unknown>;
      draftId?: string;
    };
    if (!body.data || typeof body.data !== 'object') {
      return NextResponse.json({ error: '상담 내용을 입력해 주세요.' }, { status: 400 });
    }
    const result = await createConsultation(body.data, user.name, { draftId: body.draftId });
    return NextResponse.json({
      consultId: result.consultId,
      inquiryId: result.inquiry.id,
      processId: result.process.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '상호명은 필수입니다.' }, { status: 400 });
    }
    if (e instanceof Error && e.message === 'DRAFT_NOT_FOUND') {
      return NextResponse.json({ error: '초안을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
