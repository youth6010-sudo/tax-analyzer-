import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { buildClientIdToReviewKeysMap } from '@/lib/review/clientLink';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/client-id-review-map]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET() {
  try {
    await requireUser();
    const byClientId = await buildClientIdToReviewKeysMap();
    return NextResponse.json(
      { byClientId },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
