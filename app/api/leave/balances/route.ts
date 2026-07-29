import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageLeaveBalance, canViewAllLeaveBalances } from '@/lib/leaveAccess';
import { listLeaveBalances, upsertLeaveBalance } from '@/lib/leaveDb';
import { managerNamesMatch } from '@/app/utils/managerMatch';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const yearParam = new URL(req.url).searchParams.get('year');
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isInteger(year)) {
      return NextResponse.json({ error: '연도가 올바르지 않습니다.' }, { status: 400 });
    }
    let items = await listLeaveBalances(year);
    if (!canViewAllLeaveBalances(user)) {
      const myName = user.name?.trim() || '';
      items = items.filter(i => managerNamesMatch(i.memberName, myName));
    }
    return NextResponse.json({
      items,
      year,
      canManage: canManageLeaveBalance(user),
      canViewAll: canViewAllLeaveBalances(user),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageLeaveBalance(user)) {
      return NextResponse.json({ error: '연차 잔고는 인디·페리만 수정할 수 있습니다.' }, { status: 403 });
    }
    const body = (await req.json()) as {
      memberName?: string;
      year?: number;
      hireDate?: string;
      resignDate?: string;
      useHireDateBasis?: boolean;
      accrued?: number;
      carryOver?: number;
      increase?: number;
      decrease?: number;
    };
    if (!body.memberName || !body.year) {
      return NextResponse.json({ error: '담당자·연도가 필요합니다.' }, { status: 400 });
    }
    const item = await upsertLeaveBalance(user.name, {
      memberName: body.memberName,
      year: body.year,
      hireDate: body.hireDate,
      resignDate: body.resignDate,
      useHireDateBasis: body.useHireDateBasis,
      accrued: body.accrued,
      carryOver: body.carryOver,
      increase: body.increase,
      decrease: body.decrease,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '저장 실패';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
