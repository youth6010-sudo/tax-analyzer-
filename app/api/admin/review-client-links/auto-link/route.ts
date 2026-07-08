import { NextResponse } from 'next/server';

import { requireReviewLinkAdmin } from '@/lib/auth';
import { runAutoLinkReviewClients } from '@/lib/review/autoLinkReview';
import { invalidateClientLinksIndexCache } from '@/lib/review/clientLink';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '검토표 연결 Admin 권한이 없습니다.' }, { status: 403 });
  }
  console.error('[admin/review-client-links/auto-link]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function POST() {
  try {
    const user = await requireReviewLinkAdmin();
    const result = await runAutoLinkReviewClients(user.id);
    invalidateClientLinksIndexCache();
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
