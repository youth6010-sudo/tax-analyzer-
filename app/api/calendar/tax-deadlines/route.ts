import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listUpcomingTaxDeadlines } from '@/lib/taxDeadlineCalendar';

export async function GET() {
  try {
    await requireUser();
    const items = await listUpcomingTaxDeadlines(15);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
