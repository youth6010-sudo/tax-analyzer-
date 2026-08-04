import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { shouldFilterClientsToMine, type RestrictedClientListScope } from '@/lib/masterAccess';
import { searchClients } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const sp = request.nextUrl.searchParams;
    const q = sp.get('q') ?? '';
    const activeOnly = sp.get('activeOnly') === '1';
    const includeChurned = sp.get('includeChurned') === '1';
    const includeIntake = sp.get('includeIntake') !== '0';
    const scope = sp.get('scope') as RestrictedClientListScope | null;
    const requestedMineOnly = sp.get('mineOnly') === '1';
    const mineOnly = requestedMineOnly || shouldFilterClientsToMine(user, scope);
    const forChurn = sp.get('forChurn') === '1';
    const clients = await searchClients(q, {
      activeOnly,
      includeChurned,
      includeIntake,
      mineOnly,
      userId: user.id,
      userName: user.name,
      forChurn,
      // 안내문·신고확인은 업체명·사업자번호 위주 — 연락처 조인 생략으로 응답 지연 완화
      skipContacts: scope === 'notice' || scope === 'filing',
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return handleApiError(e);
  }
}
