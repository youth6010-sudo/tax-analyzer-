import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { resolveClientLink } from '@/lib/review/clientLink';
import { companyLinkKey } from '@/lib/review/companyKey';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const normalized = companyLinkKey(key);
    if (!normalized) {
      return NextResponse.json({ error: 'key required' }, { status: 400 });
    }

    const { clients, primary, manual } = await resolveClientLink(normalized);
    if (!clients.length) {
      return NextResponse.json({
        match: null,
        primary: null,
        clients: [],
        key: normalized,
        linked: false,
        manual,
      });
    }

    return NextResponse.json({
      match: primary,
      primary,
      clients,
      key: normalized,
      linked: true,
      manual,
    });
  } catch (e) {
    return apiError(e);
  }
}
