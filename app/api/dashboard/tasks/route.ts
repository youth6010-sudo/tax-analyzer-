import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listDashboardTasks } from '@/lib/dashboardTasks';

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listDashboardTasks(user.name);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
