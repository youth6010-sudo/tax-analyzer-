// 수임처의 블루홀 변경(감사) 로그 (Phase 5)
//   GET → { logs: [...] }  (로그인 사용자면 조회 가능)
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById } from '@/lib/clientsDb';
import { getSyncLogForClient } from '@/lib/blueholeSyncDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client);

    const logs = await getSyncLogForClient(id, 30);
    return NextResponse.json({ logs }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
