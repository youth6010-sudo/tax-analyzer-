import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getReviewAccessForUser } from '@/lib/review/access';
import { getReviewListLayoutFull } from '@/lib/reviewListLayoutDb';
import { getReviewGridMetaAsync, isReviewGridReady } from '@/lib/review/gridData';
import {
  DEFAULT_REVIEW_TAX_YEAR,
  normalizeReviewTaxYear,
  REVIEW_TAX_YEARS,
} from '@/lib/review/taxYear';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/session]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const taxYear = normalizeReviewTaxYear(
      request.nextUrl.searchParams.get('year') || DEFAULT_REVIEW_TAX_YEAR,
    );
    const access = getReviewAccessForUser(user, taxYear);
    const [meta, listLayoutFull, gridReady] = await Promise.all([
      getReviewGridMetaAsync(),
      getReviewListLayoutFull(),
      isReviewGridReady(),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        loginId: user.loginId,
      },
      taxYear: access.taxYear,
      taxYears: [...REVIEW_TAX_YEARS],
      defaultTaxYear: DEFAULT_REVIEW_TAX_YEAR,
      reviewOwner: access.reviewOwner,
      isMaster: access.isMaster,
      isIndie: access.isIndie,
      canEdit: access.canEdit,
      canEditLayout: access.canEditLayout,
      access: access.access,
      sheetMapping: access.sheetMapping,
      listLayouts: listLayoutFull.layouts,
      listWidths: listLayoutFull.widths,
      gridMeta: meta,
      gridReady,
      gridFromDb: meta.fromDb === true,
      embed: true,
    });
  } catch (e) {
    return apiError(e);
  }
}
