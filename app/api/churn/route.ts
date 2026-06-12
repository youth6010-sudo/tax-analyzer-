import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listChurnRecords, listChurnedClientsWithoutRecord } from '@/lib/clientsDb';

export async function GET() {
  try {
    await requireUser();
    const [records, missingClients] = await Promise.all([
      listChurnRecords(),
      listChurnedClientsWithoutRecord(),
    ]);
    return NextResponse.json({ records, missingClients });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
