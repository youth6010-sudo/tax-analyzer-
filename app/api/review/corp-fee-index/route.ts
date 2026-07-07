import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { buildPrimaryClientLinksByKey } from '@/lib/review/clientLinkDb';
import { buildCorpFeeIndex } from '@/lib/review/corpFeeIndex';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/corp-fee-index]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET() {
  try {
    await requireUser();
    const [index, primaryLinksByKey] = await Promise.all([
      buildCorpFeeIndex(),
      buildPrimaryClientLinksByKey(),
    ]);
    return NextResponse.json({ ...index, primaryLinksByKey }, {
      headers: {
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
