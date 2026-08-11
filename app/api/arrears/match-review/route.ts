import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { canUseCharlieFeatures } from '@/lib/masterAccess';
import { buildMatchReview } from '@/lib/arrearsMatchReview';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 공문 ↔ 원장 미매칭·유사명 후보 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const review = await buildMatchReview();
    return NextResponse.json(
      {
        ...review,
        canLink: canUseCharlieFeatures(user),
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
