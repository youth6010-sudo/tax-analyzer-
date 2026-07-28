import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { listImprovementRequests } from '@/lib/personalChecklist';

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listImprovementRequests(user.name);
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}
