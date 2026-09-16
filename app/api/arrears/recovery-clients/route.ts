import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listArrearsRecoveryRefs } from '@/lib/arrearsDb';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 수임처관리 — 미수 채권회수 하이라이트용 (id·상호 키만) */
export async function GET() {
  try {
    await requireUser();
    const refs = await listArrearsRecoveryRefs();
    return NextResponse.json(refs, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
