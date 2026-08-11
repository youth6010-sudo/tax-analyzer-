import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getInfraStatus } from '@/lib/infraStatus';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 로그인 사용자용 — 비밀 없이 인프라 배지 정보 */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ ok: true, ...getInfraStatus() }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
