import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { readArrearsChurnStatuses, writeArrearsChurnStatuses } from '@/lib/arrearsChurnStatusDb';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 미수관리·채권관리 공용 해임 구분 목록 */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ items: await readArrearsChurnStatuses() }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}

/** 수정 모드에서 목록 편집 (이름·색·순서·추가·삭제) */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { items?: unknown };
    try {
      const items = await writeArrearsChurnStatuses(body.items);
      return NextResponse.json({ items }, NO_STORE);
    } catch (e) {
      if (e instanceof Error) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}
