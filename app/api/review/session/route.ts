import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getReviewAccessForUser } from '@/lib/review/access';
import { getReviewListLayouts } from '@/lib/reviewListLayoutDb';
import { getReviewGridMetaAsync, isReviewGridReady } from '@/lib/review/gridData';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/session]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET() {
  try {
    const user = await requireUser();
    const access = getReviewAccessForUser(user);
    const [meta, listLayouts, gridReady] = await Promise.all([
      getReviewGridMetaAsync(),
      getReviewListLayouts(),
      isReviewGridReady(),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        loginId: user.loginId,
      },
      reviewOwner: access.reviewOwner,
      isMaster: access.isMaster,
      isIndie: access.isIndie,
      canEdit: access.canEdit,
      canEditLayout: access.canEditLayout,
      access: access.access,
      sheetMapping: access.sheetMapping,
      listLayouts,
      gridMeta: meta,
      gridReady,
      gridFromDb: meta.fromDb === true,
      embed: true,
    });
  } catch (e) {
    return apiError(e);
  }
}
