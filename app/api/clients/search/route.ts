import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser, isPortalAdmin } from '@/lib/auth';
import { searchClients } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const sp = request.nextUrl.searchParams;
    const q = sp.get('q') ?? '';
    const activeOnly = sp.get('activeOnly') === '1';
    const includeChurned = sp.get('includeChurned') === '1';
    const includeIntake = sp.get('includeIntake') !== '0';
    const mineOnly = !isPortalAdmin(user);
    const clients = await searchClients(q, {
      activeOnly,
      includeChurned,
      includeIntake,
      mineOnly,
      userId: user.id,
      userName: user.name,
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return handleApiError(e);
  }
}
