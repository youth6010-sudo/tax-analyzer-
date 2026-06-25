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
    // 기본은 전체 검색이지만, mineOnly=1이면 담당(본인) 수임처만 반환한다.
    const mineOnly = sp.get('mineOnly') === '1';
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
