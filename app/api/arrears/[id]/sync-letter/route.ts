import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { getArrearsEntryById } from '@/lib/arrearsDb';
import { getArrearsLetterDetail, syncLetterDiffWithLedger } from '@/lib/arrearsLetterDb';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

type Ctx = { params: Promise<{ id: string }> };

/** 원장 잔액(항목 balance)과 공문 내역 잔액을 맞추는 ledger 라인 삽입 */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '원장 잔액 맞춤은 인디·찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }
    const { id } = await ctx.params;
    const item = await getArrearsEntryById(id);
    if (!item) {
      return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const asOf = item.asOfDate || new Date().toISOString().slice(0, 10);
    const sync = await syncLetterDiffWithLedger(
      id,
      item.balance,
      asOf,
      user.name || user.loginId || '',
    );
    const detail = await getArrearsLetterDetail(id);
    return NextResponse.json(
      {
        applied: sync.applied,
        diff: sync.diff,
        ...detail,
        canManage: true,
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
