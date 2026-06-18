import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { getPortalSearchIndex } from '@/lib/portalBootstrap';

export async function GET() {
  try {
    const searchIndex = await getPortalSearchIndex();
    return NextResponse.json({ searchIndex, fetchedAt: Date.now() });
  } catch (e) {
    return handleApiError(e);
  }
}
