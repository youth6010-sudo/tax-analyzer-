import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listCalendarEvents } from '@/lib/calendarEvents';

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

    const items = await listCalendarEvents(ownerNames, from, to);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
