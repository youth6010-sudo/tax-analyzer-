import { NextResponse } from 'next/server';
import { getPortalBootstrap } from '@/lib/portalBootstrap';

export async function GET() {
  try {
    const data = await getPortalBootstrap();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (/timed out/i.test(message)) {
      return NextResponse.json({ error: 'Bootstrap timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Bootstrap failed' }, { status: 500 });
  }
}
