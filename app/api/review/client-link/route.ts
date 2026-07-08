import { NextRequest, NextResponse } from 'next/server';
import { requireReviewLinkAdmin, requireUser } from '@/lib/auth';
import { replaceReviewClientLinks } from '@/lib/review/clientLinkDb';
import {
  getClientLinkSuggestions,
  invalidateClientLinksIndexCache,
  resolveClientLink,
} from '@/lib/review/clientLink';
import { companyLinkKey, normalizeReviewLookupKey } from '@/lib/review/companyKey';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '검토표 연결 권한이 없습니다.' }, { status: 403 });
  }
  console.error('[review/client-link]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const key =
      request.nextUrl.searchParams.get('key') ??
      request.nextUrl.searchParams.get('name') ??
      '';
    const owner = request.nextUrl.searchParams.get('owner') ?? undefined;
    const personName = request.nextUrl.searchParams.get('personName') ?? undefined;

    const normalized = normalizeReviewLookupKey(key);
    if (!normalized) {
      return NextResponse.json({ error: 'key required' }, { status: 400 });
    }

    const wantSuggestions = request.nextUrl.searchParams.get('suggestions') === '1';
    const lookupOptions = { owner, personName };

    const { clients, primary, manual } = await resolveClientLink(normalized, lookupOptions);
    if (!clients.length) {
      const suggestions = wantSuggestions
        ? await getClientLinkSuggestions(normalized, lookupOptions)
        : [];
      return NextResponse.json({
        match: null,
        primary: null,
        clients: [],
        key: normalized,
        linked: false,
        manual,
        suggestions,
      });
    }

    return NextResponse.json({
      match: primary,
      primary,
      clients,
      key: normalized,
      linked: true,
      manual,
      suggestions: [],
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
    invalidateClientLinksIndexCache();
    const resolved = await resolveClientLink(reviewKey);
    return NextResponse.json({
      ok: true,
      key: reviewKey,
      linked: resolved.clients.length > 0,
      clients: resolved.clients,
      primary: resolved.primary,
      manual: true,
    });
  } catch (e) {
    return apiError(e);
  }
}
