import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { buildClientLinksIndex } from '@/lib/review/clientLink';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/client-links-index]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET() {
  try {
    await requireUser();
    const index = await buildClientLinksIndex();
    return NextResponse.json(
      { index },
      {
        headers: {
          'Cache-Control': 'private, max-age=30',
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
