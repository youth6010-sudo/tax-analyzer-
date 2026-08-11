import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canUseCharlieFeatures } from '@/lib/masterAccess';
import { mergeLetterEntryIntoCodedEntry } from '@/lib/arrearsRestart';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 찰리: 연결필요 공문 행 → 코드 있는 원장 행으로 즉시 이동 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canUseCharlieFeatures(user)) {
      return NextResponse.json(
        { error: '공문·원장 연결은 찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      letterEntryId?: string;
      targetEntryId?: string;
    };

    const letterEntryId = String(body.letterEntryId || '').trim();
    const targetEntryId = String(body.targetEntryId || '').trim();
    if (!letterEntryId || !targetEntryId) {
      return NextResponse.json(
        { error: 'letterEntryId, targetEntryId 가 필요합니다.' },
        { status: 400 },
      );
    }

    const result = await mergeLetterEntryIntoCodedEntry({
      letterEntryId,
      targetEntryId,
      actorName: user.name?.trim() || '찰리',
    });

    return NextResponse.json(result, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
