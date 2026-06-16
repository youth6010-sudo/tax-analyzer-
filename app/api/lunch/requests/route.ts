import { NextRequest, NextResponse } from 'next/server';
import { isPortalAdmin, requireAdmin, requireUser } from '@/lib/auth';
import { createLunchSpotRequest, listPendingLunchSpotRequests } from '@/lib/lunchRequestsDb';

export async function GET() {
  try {
    await requireAdmin();
    const items = await listPendingLunchSpotRequests();
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { name?: string; note?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: '식당 이름을 입력해 주세요.' }, { status: 400 });
    }
    const item = await createLunchSpotRequest({
      name,
      note: body.note,
      requestedBy: user.id,
      requestedByName: user.name,
    });
    return NextResponse.json({ item, isAdmin: isPortalAdmin(user) });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
