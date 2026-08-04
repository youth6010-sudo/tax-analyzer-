import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears, canViewArrearsRow } from '@/lib/arrearsAccess';
import { getArrearsEntryById, patchArrearsEntry } from '@/lib/arrearsDb';
import { getArrearsLetterDetail } from '@/lib/arrearsLetterDb';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const withLetter = url.searchParams.get('letter') !== '0';

    if (withLetter) {
      const detail = await getArrearsLetterDetail(id);
      if (!detail) {
        return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (!canViewArrearsRow(user, detail.item.managerName)) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
      return NextResponse.json(
        {
          item: detail.item,
          lines: detail.lines,
          letterBalance: detail.letterBalance,
          balanceDiff: detail.balanceDiff,
          canManage: canManageArrears(user),
        },
        NO_STORE,
      );
    }

    const item = await getArrearsEntryById(id);
    if (!item) {
      return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canViewArrearsRow(user, item.managerName)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    return NextResponse.json({ item, canManage: canManageArrears(user) }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '미수 수정은 인디·찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      managerName?: string;
      mgmtCategory?: string;
      memo?: string;
      cmsNote?: string;
      balance?: number;
      balanceAction?: 'pay' | 'charge';
      amount?: number;
      letterDate?: string;
    };

    try {
      const item = await patchArrearsEntry(id, user.name || user.loginId || '', {
        managerName: body.managerName,
        mgmtCategory: body.mgmtCategory,
        memo: body.memo,
        cmsNote: body.cmsNote,
        balance: body.balance,
        balanceAction: body.balanceAction,
        amount: body.amount,
        letterDate: body.letterDate,
      });
      return NextResponse.json({ item }, NO_STORE);
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') {
        return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (e instanceof Error && /올바르지|커야/.test(e.message)) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}
