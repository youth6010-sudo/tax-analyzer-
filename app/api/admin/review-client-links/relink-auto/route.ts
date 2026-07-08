import { NextResponse } from 'next/server';

import { requireReviewLinkAdmin } from '@/lib/auth';
import { runAutoLinkReviewClients } from '@/lib/review/autoLinkReview';
import { invalidateClientLinksIndexCache } from '@/lib/review/clientLink';
import { deleteAutoReviewClientLinks } from '@/lib/review/clientLinkDb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '검토표 연결 Admin 권한이 없습니다.' }, { status: 403 });
  }
  console.error('[admin/review-client-links/relink-auto]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

/** 자동 연결 삭제 후 새 규칙으로 재연결 — 수동 연결은 유지 */
export async function POST() {
  try {
    const user = await requireReviewLinkAdmin();
    const cleared = await deleteAutoReviewClientLinks();
    invalidateClientLinksIndexCache();
    const result = await runAutoLinkReviewClients(user.id);
    invalidateClientLinksIndexCache();
    return NextResponse.json({ cleared, ...result });
  } catch (e) {
    return apiError(e);
  }
}
