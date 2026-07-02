import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';

export async function GET() {
  try {
    const user = await requireUser();
    const members = await listCalendarTeamMembers();
    return NextResponse.json({ members, currentUser: user.name });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
