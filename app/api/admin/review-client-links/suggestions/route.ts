import { NextRequest, NextResponse } from 'next/server';

import { requireReviewLinkAdmin } from '@/lib/auth';
import { getClientLinkSuggestions } from '@/lib/review/clientLink';
import { normalizeReviewLookupKey } from '@/lib/review/companyKey';

export const dynamic = 'force-dynamic';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '검토표 연결 Admin 권한이 없습니다.' }, { status: 403 });
  }
  console.error('[admin/review-client-links/suggestions]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireReviewLinkAdmin();
    const reviewKey = normalizeReviewLookupKey(request.nextUrl.searchParams.get('reviewKey') ?? '');
    if (!reviewKey) {
      return NextResponse.json({ error: 'reviewKey required' }, { status: 400 });
    }
    const owner = request.nextUrl.searchParams.get('owner')?.trim() || undefined;
    const personName = request.nextUrl.searchParams.get('personName')?.trim() || undefined;
    const suggestions = await getClientLinkSuggestions(reviewKey, { owner, personName });
    return NextResponse.json({ suggestions });
  } catch (e) {
    return apiError(e);
  }
}
