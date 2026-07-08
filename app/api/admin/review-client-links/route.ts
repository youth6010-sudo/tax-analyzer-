import { NextRequest, NextResponse } from 'next/server';

import { requireReviewLinkAdmin } from '@/lib/auth';
import { listUnlinkedReviewCompanies } from '@/lib/review/reviewCompanyIndex';
import {
  deleteAllReviewClientLinks,
  removeReviewClientLink,
  replaceReviewClientLinks,
} from '@/lib/review/clientLinkDb';
import { normalizeReviewLookupKey } from '@/lib/review/companyKey';

export const dynamic = 'force-dynamic';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '검토표 연결 Admin 권한이 없습니다.' }, { status: 403 });
  }
  console.error('[admin/review-client-links]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET() {
  try {
    await requireReviewLinkAdmin();
    const data = await listUnlinkedReviewCompanies();
    return NextResponse.json({
      unlinked: data.unlinked,
      linked: data.linked,
      links: data.links,
      suggestionsByKey: data.suggestionsByKey,
      clients: data.clients.map(c => ({
        id: c.id,
        companyName: c.companyName,
        manager: c.manager,
        businessNo: c.businessNo,
        status: c.status,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireReviewLinkAdmin();
    const body = (await request.json()) as {
      reviewKey?: string;
      reviewName?: string;
      clientId?: string;
      clientIds?: string[];
    };
    const reviewKey = normalizeReviewLookupKey(body.reviewKey ?? body.reviewName ?? '');
    if (!reviewKey) {
      return NextResponse.json({ error: 'reviewKey required' }, { status: 400 });
    }

    const clientIds = Array.isArray(body.clientIds)
      ? body.clientIds.filter(Boolean)
      : body.clientId
        ? [body.clientId]
        : [];

    if (!clientIds.length) {
      return NextResponse.json({ error: 'clientIds required' }, { status: 400 });
    }

    await replaceReviewClientLinks({
      reviewKey,
      reviewName: body.reviewName?.trim() || reviewKey,
      clientIds,
      updatedBy: user.id,
      matchMethod: 'manual',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireReviewLinkAdmin();
    const reviewKey = normalizeReviewLookupKey(request.nextUrl.searchParams.get('reviewKey') ?? '');
    const clientId = request.nextUrl.searchParams.get('clientId')?.trim() ?? '';
    if (!reviewKey) {
      return NextResponse.json({ error: 'reviewKey required' }, { status: 400 });
    }
    if (clientId) {
      await removeReviewClientLink(reviewKey, clientId);
    } else {
      await deleteAllReviewClientLinks(reviewKey);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
