import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { isMasterUser } from '@/lib/clientAccess';
import {
  getFilingCheckSession,
  loadFilingCheckSessionWithCarry,
  upsertFilingCheckSession,
  findPreviousCompletedFilingCheckSession,
  type FilingCheckSessionData,
} from '@/lib/taxFilingChecksDb';
import { filingSessionToTaxDeadlineIds } from '@/lib/filingCheckTaxDeadlineIds';
import { setTaxDeadlineCheckoff } from '@/lib/taxDeadlineCheckoffs';
import { previousPeriodKey } from '@/app/utils/filingCheck';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const manager = searchParams.get('manager') ?? '';
    const taxType = searchParams.get('taxType') ?? '';
    const periodKey = searchParams.get('periodKey') ?? '';
    const withCarry = searchParams.get('withCarry') === '1';

    if (!manager || !taxType || !periodKey) {
      return NextResponse.json({ error: 'manager, taxType, periodKey required' }, { status: 400 });
    }

    if (!isMasterUser(user) && manager !== user.name && manager !== '전체') {
      throw new Error('FORBIDDEN');
    }

    /** 직전 신고 대비 — 완료 세션 우선, 없으면 달력상 직전 기간 */
    if (searchParams.get('previousCompleted') === '1') {
      const found = await findPreviousCompletedFilingCheckSession(manager, taxType, periodKey);
      let prevPk = found?.periodKey ?? null;

      if (!prevPk) {
        prevPk = previousPeriodKey(taxType as never, periodKey);
      }
      if (!prevPk) {
        return NextResponse.json({ data: null, periodKey: null });
      }

      // 담당자: 완료 세션 원본 그대로 (별칭으로 찾은 경우 포함)
      if (found && manager !== '전체') {
        return NextResponse.json({
          data: found.data,
          periodKey: found.periodKey,
          fromCompleted: true,
        });
      }

      // 「전체」또는 미완료 폴백 — 담당자 세션 합산(전체는 DB에 쓰지 않음)
      const loaded = await loadFilingCheckSessionWithCarry(manager, taxType, prevPk);
      return NextResponse.json({
        data: { ...loaded.data, done: found ? true : loaded.data.done },
        periodKey: prevPk,
        fromCompleted: Boolean(found),
      });
    }

    if (withCarry) {
      const loaded = await loadFilingCheckSessionWithCarry(manager, taxType, periodKey);
      return NextResponse.json({
        data: loaded.data,
        carriedFromPeriodKey: loaded.carriedFromPeriodKey,
      });
    }

    const data = await getFilingCheckSession(manager, taxType, periodKey);
    return NextResponse.json({ data });
  } catch (e) {
    return handleApiError(e);
  }
}

/** 신고대상확인 완료 ↔ 회사일정 세무마감 체크오프 동기화 */
async function syncCompanyCalendarCheckoffs(
  manager: string,
  taxType: string,
  periodKey: string,
  wasDone: boolean,
  nowDone: boolean,
): Promise<void> {
  if (manager === '전체' || !manager.trim()) return;
  if (wasDone === nowDone) return;

  const deadlineIds = filingSessionToTaxDeadlineIds(taxType, periodKey);
  if (deadlineIds.length === 0) return;

  await Promise.all(
    deadlineIds.map(id => setTaxDeadlineCheckoff(id, manager.trim(), nowDone)),
  );
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      manager?: string;
      taxType?: string;
      periodKey?: string;
      data?: FilingCheckSessionData;
    };

    const manager = body.manager ?? '';
    const taxType = body.taxType ?? '';
    const periodKey = body.periodKey ?? '';
    const data = body.data;

    if (!manager || !taxType || !periodKey || !data) {
      return NextResponse.json({ error: 'manager, taxType, periodKey, data required' }, { status: 400 });
    }

    if (!isMasterUser(user) && manager !== user.name) {
      throw new Error('FORBIDDEN');
    }

    const prev = await getFilingCheckSession(manager, taxType, periodKey);
    const wasDone = Boolean(prev?.done);
    const nowDone = Boolean(data.done);

    await upsertFilingCheckSession(manager, taxType, periodKey, data, user.id);
    await syncCompanyCalendarCheckoffs(manager, taxType, periodKey, wasDone, nowDone);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
