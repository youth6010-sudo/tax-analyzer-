import { NextRequest, NextResponse } from 'next/server';

import { requireCharlie } from '@/lib/auth';
import { listClients } from '@/lib/clientsDb';
import {
  deleteAllReviewClientLinks,
  listReviewClientLinks,
  removeReviewClientLink,
  replaceReviewClientLinks,
} from '@/lib/review/clientLinkDb';
import { companyLinkKey } from '@/lib/review/companyKey';
import { listUnlinkedReviewCompanies } from '@/lib/review/reviewCompanyIndex';

export const dynamic = 'force-dynamic';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '찰리 계정만 접근할 수 있습니다.' }, { status: 403 });
  }
  console.error('[admin/review-client-links]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET() {
  try {
    await requireCharlie();
    const data = await listUnlinkedReviewCompanies();
    const links = await listReviewClientLinks();
    const clients = await listClients({ includeChurned: true });
    return NextResponse.json({
      unlinked: data.unlinked,
      linked: data.linked,
      links,
      clients: clients.map(c => ({
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
    const user = await requireCharlie();
    const body = (await request.json()) as {
      reviewKey?: string;
      reviewName?: string;
      clientId?: string;
      clientIds?: string[];
    };
    const reviewKey = companyLinkKey(body.reviewKey ?? body.reviewName ?? '');
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
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireCharlie();
    const reviewKey = companyLinkKey(request.nextUrl.searchParams.get('reviewKey') ?? '');
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
