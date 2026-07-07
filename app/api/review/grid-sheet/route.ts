import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { readReviewGridSheets } from '@/lib/review/gridData';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message.includes('not found')) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
  console.error('[review/grid-sheet]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const raw = request.nextUrl.searchParams.get('names') ?? '';
    const names = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!names.length) {
      return NextResponse.json({ error: 'names required' }, { status: 400 });
    }
    const data = await readReviewGridSheets(names);
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': data.fromDb ? 'private, max-age=120' : 'private, max-age=60',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
