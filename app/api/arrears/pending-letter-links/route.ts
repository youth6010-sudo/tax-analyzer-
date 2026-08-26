import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { buildDbPendingLetterLinks } from '@/lib/arrearsRestart';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** DB: 연결필요(letter:) ↔ 코드 있는 원장 행 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const review = await buildDbPendingLetterLinks();
    return NextResponse.json(
      {
        mode: 'db',
        ...review,
        canLink: true,
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
