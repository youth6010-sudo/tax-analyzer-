import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { listChurnRecords, listChurnedClientsWithoutRecord } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const mineOnly = request.nextUrl.searchParams.get('mine') === '1';
    const accessFilter = mineOnly
      ? { mineOnly: true as const, userId: user.id, userName: user.name }
      : {};
    const [records, missingClients] = await Promise.all([
      listChurnRecords(accessFilter),
      listChurnedClientsWithoutRecord(accessFilter),
    ]);
    return NextResponse.json({ records, missingClients });
  } catch (e) {
    return handleApiError(e);
  }
}
