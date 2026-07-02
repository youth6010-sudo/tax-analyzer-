import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { getDashboardCalendarProgress } from '@/lib/dashboardCalendarProgress';

export async function GET() {
  try {
    const user = await requireUser();
    const progress = await getDashboardCalendarProgress(user.name);
    return NextResponse.json(progress);
  } catch (e) {
    return handleApiError(e);
  }
}
