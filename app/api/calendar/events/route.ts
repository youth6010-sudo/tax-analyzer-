import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listCalendarEvents } from '@/lib/calendarEvents';
import { isDataViewer } from '@/lib/masterAccess';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
    const to = url.searchParams.get('to') || from;
    const ownersParam = url.searchParams.get('owners');
    const ownerNames = ownersParam
      ? ownersParam.split(',').map(s => s.trim()).filter(Boolean)
      : [user.name];

    const items = await listCalendarEvents(ownerNames, from, to, {
      viewerName: user.name,
      includeCheckoffDetails: isDataViewer(user),
    });
    return NextResponse.json({ items, canViewCheckoffDetails: isDataViewer(user) });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('calendar events error', err);
    return NextResponse.json({ error: '일정을 불러오지 못했습니다.' }, { status: 500 });
  }
}
