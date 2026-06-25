import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { getUserNoticeTemplate, setUserNoticeTemplate } from '@/lib/noticeTemplateDb';

export async function GET() {
  try {
    const user = await requireUser();
    const template = await getUserNoticeTemplate(user.id);
    return NextResponse.json({ template });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const template = typeof body.template === 'string' ? body.template : '';
    await setUserNoticeTemplate(user.id, template);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
