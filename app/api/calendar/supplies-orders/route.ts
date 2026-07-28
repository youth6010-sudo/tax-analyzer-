import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { listSuppliesOrders } from '@/lib/personalChecklist';

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listSuppliesOrders(user.name);
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}
