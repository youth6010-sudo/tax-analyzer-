import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { searchClients } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = request.nextUrl.searchParams;
    const q = sp.get('q') ?? '';
    const activeOnly = sp.get('activeOnly') === '1';
    const includeChurned = sp.get('includeChurned') === '1';
    const includeIntake = sp.get('includeIntake') !== '0';
    const clients = await searchClients(q, { activeOnly, includeChurned, includeIntake });
    return NextResponse.json({ clients });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
