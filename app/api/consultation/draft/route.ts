import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { saveConsultationDraft } from '@/lib/consultationDb';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      inquiryId?: string;
      data?: Record<string, unknown>;
      stepIdx?: number;
      stepTitle?: string;
    };
    if (!body.data || typeof body.data !== 'object') {
      return NextResponse.json({ error: '저장할 내용이 없습니다.' }, { status: 400 });
    }
    const stepIdx = typeof body.stepIdx === 'number' ? body.stepIdx : 0;
    const row = await saveConsultationDraft(
      body.data,
      stepIdx,
      user.name,
      body.inquiryId,
      body.stepTitle,
    );
    return NextResponse.json({ inquiryId: row.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: '초안을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
