import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { resolveLinkContext } from '@/lib/review/clientLink';
import { companyLinkKey } from '@/lib/review/companyKey';

export const dynamic = 'force-dynamic';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/link-context]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const reviewKey = request.nextUrl.searchParams.get('reviewKey');
    const clientId = request.nextUrl.searchParams.get('clientId');
    if (!reviewKey && !clientId) {
      return NextResponse.json({ error: 'reviewKey or clientId required' }, { status: 400 });
    }

    const ctx = await resolveLinkContext({
      reviewKey: reviewKey ? companyLinkKey(reviewKey) : undefined,
      clientId: clientId ?? undefined,
    });
    if (!ctx) {
      return NextResponse.json({ linked: false, context: null });
    }
    return NextResponse.json({ linked: ctx.linked, context: ctx });
  } catch (e) {
    return apiError(e);
  }
}
