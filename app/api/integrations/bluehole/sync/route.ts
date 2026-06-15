import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getInquiryById, updateInquiry } from '@/lib/consultationDb';
import { blueholeRefFromCase, mergeExternalRefs, parseExternalRefs } from '@/lib/externalRefs';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { inquiryId?: string; caseId?: string };
    if (!body.inquiryId || !body.caseId?.trim()) {
      return NextResponse.json({ error: 'inquiryId와 caseId가 필요합니다.' }, { status: 400 });
    }

    const existing = await getInquiryById(body.inquiryId);
    const ref = blueholeRefFromCase(body.caseId, user.name);
    const prevExt = parseExternalRefs((existing.extra ?? {}) as Record<string, unknown>);
    const externalRefs = mergeExternalRefs(prevExt, { bluehole: ref ?? undefined });

    const inquiry = await updateInquiry(body.inquiryId, {
      extra: {
        blueholeCase: body.caseId.trim(),
        externalRefs,
      },
    });

    return NextResponse.json({ inquiry });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
