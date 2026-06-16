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
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
