import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { readReviewGridFile } from '@/lib/review/gridData';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message.includes('not found')) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
  console.error('[review/grid]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET() {
  try {
    await requireUser();
    const data = readReviewGridFile();
    return NextResponse.json(data);
  } catch (e) {
    return apiError(e);
  }
}
