import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { searchClients } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const sp = request.nextUrl.searchParams;
    const q = sp.get('q') ?? '';
    const activeOnly = sp.get('activeOnly') === '1';
    const includeChurned = sp.get('includeChurned') === '1';
    const includeIntake = sp.get('includeIntake') !== '0';
    // 검색은 담당과 무관하게 누구나 모든 업체를 검색할 수 있어야 한다.
    const clients = await searchClients(q, {
      activeOnly,
      includeChurned,
      includeIntake,
      mineOnly: false,
      userId: user.id,
      userName: user.name,
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return handleApiError(e);
  }
}
