import { NextResponse } from 'next/server';
import { isDataViewer, requireUser } from '@/lib/auth';
import { listDashboardTasks } from '@/lib/dashboardTasks';

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listDashboardTasks({ name: user.name, isAdmin: isDataViewer(user) });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
