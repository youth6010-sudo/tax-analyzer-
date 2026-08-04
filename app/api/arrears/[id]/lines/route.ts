import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears, canViewArrearsRow } from '@/lib/arrearsAccess';
import { getArrearsEntryById } from '@/lib/arrearsDb';
import {
  appendLetterLine,
  getArrearsLetterDetail,
  replaceLetterLines,
} from '@/lib/arrearsLetterDb';
import type { ArrearsLetterLineInput } from '@/app/types/arrears';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const detail = await getArrearsLetterDetail(id);
    if (!detail) {
      return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!canViewArrearsRow(user, detail.item.managerName)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    return NextResponse.json(
      {
        ...detail,
        canManage: canManageArrears(user),
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '공문 내역 수정은 인디·찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }
    const { id } = await ctx.params;
    const existing = await getArrearsEntryById(id);
    if (!existing) {
      return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      lines?: ArrearsLetterLineInput[];
      letterDate?: string;
      syncBalance?: boolean;
    };

    if (!Array.isArray(body.lines)) {
      return NextResponse.json({ error: 'lines 배열이 필요합니다.' }, { status: 400 });
    }

    try {
      const result = await replaceLetterLines(
        id,
        user.name || user.loginId || '',
        body.lines,
        {
          letterDate: body.letterDate,
          syncBalance: body.syncBalance !== false,
        },
      );
      return NextResponse.json({ ...result, canManage: true }, NO_STORE);
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') {
        return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
      }
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '공문 내역 수정은 인디·찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }
    const { id } = await ctx.params;
    const existing = await getArrearsEntryById(id);
    if (!existing) {
      return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      description?: string;
      amount?: number;
      paidAmount?: number;
      paidDate?: string;
      source?: 'letter' | 'ledger' | 'manual';
      /** charge=미수추가 / pay=입금 */
      action?: 'charge' | 'pay';
      syncBalance?: boolean;
    };

    let description = String(body.description || '').trim();
    let amount = Math.round(Number(body.amount) || 0);
    let paidAmount = Math.round(Number(body.paidAmount) || 0);
    let paidDate = String(body.paidDate || '').trim();

    if (body.action === 'charge') {
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: '미수 추가 금액은 0보다 커야 합니다.' }, { status: 400 });
      }
      if (!description) description = '미수 추가';
      paidAmount = 0;
    } else if (body.action === 'pay') {
      const payAmt = Math.round(Number(body.amount) || 0);
      if (!Number.isFinite(payAmt) || payAmt <= 0) {
        return NextResponse.json({ error: '입금 금액은 0보다 커야 합니다.' }, { status: 400 });
      }
      if (!description) description = '입금';
      amount = 0;
      paidAmount = payAmt;
    } else {
      if (!description) {
        return NextResponse.json({ error: '내역을 입력해 주세요.' }, { status: 400 });
      }
    }

    try {
      const result = await appendLetterLine(
        id,
        user.name || user.loginId || '',
        {
          description,
          amount,
          paidAmount,
          paidDate,
          source: body.source || 'manual',
        },
        { syncBalance: body.syncBalance !== false },
      );
      return NextResponse.json({ ...result, canManage: true }, NO_STORE);
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') {
        return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
      }
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}
