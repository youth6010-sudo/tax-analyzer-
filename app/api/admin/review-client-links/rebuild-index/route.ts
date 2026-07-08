import { NextResponse } from 'next/server';

import { requireReviewLinkAdmin } from '@/lib/auth';
import {
  invalidateReviewCompanyEntriesMemoryCache,
  invalidateUnlinkedReviewCompaniesCache,
} from '@/lib/review/reviewCompanyIndex';
import { rebuildCompanyIndexCache } from '@/lib/review/reviewCompanyIndexCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '검토표 연결 Admin 권한이 없습니다.' }, { status: 403 });
  }
  console.error('[admin/review-client-links/rebuild-index]', e);
  const detail =
    e instanceof Error
      ? e.message
      : typeof e === 'string'
        ? e
        : 'Server error';
  const hint = detail.includes('review_company_index_cache')
    ? ' npm run db:ensure-review-tables 실행 후 다시 시도해 주세요.'
    : '';
  return NextResponse.json({ error: `${detail}${hint}` }, { status: 500 });
}

export async function POST() {
  try {
    await requireReviewLinkAdmin();
    const indexMeta = await rebuildCompanyIndexCache();
    invalidateReviewCompanyEntriesMemoryCache();
    invalidateUnlinkedReviewCompaniesCache();
    return NextResponse.json({ ok: true, indexMeta });
  } catch (e) {
    return apiError(e);
  }
}
