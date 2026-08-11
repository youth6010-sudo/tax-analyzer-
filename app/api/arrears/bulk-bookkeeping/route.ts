import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import {
  applyMonthlyBookkeeping,
  previewMonthlyBookkeeping,
} from '@/lib/arrearsMonthlyBookkeeping';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 수임처 기장수수료 → 미수 월 일괄 청구 (미리보기/확정) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '월 기장료 일괄은 인디·찰리·리아(관리자)만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      yearMonth?: string;
      manager?: string;
      confirm?: boolean | string | number;
    };

    const yearMonth = body.yearMonth;
    const manager = body.manager;
    const confirm =
      body.confirm === true || body.confirm === 1 || body.confirm === '1' || body.confirm === 'true';

    if (!confirm) {
      const preview = await previewMonthlyBookkeeping({ yearMonth, manager });
      // 응답 크기: ready 전체 + skip 샘플
      const readyRows = preview.rows.filter(r => r.status === 'ready');
      const skipSample = preview.rows.filter(r => r.status !== 'ready').slice(0, 40);
      return NextResponse.json(
        {
          preview: true,
          ...preview,
          rows: [...readyRows, ...skipSample],
          skipSampleOnly: preview.skipped > skipSample.length,
        },
        NO_STORE,
      );
    }

    const result = await applyMonthlyBookkeeping(
      { yearMonth, manager },
      user.name || user.loginId || '',
    );
    return NextResponse.json({ preview: false, ...result }, NO_STORE);
  } catch (e) {
    if (e instanceof Error && /yearMonth/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handleApiError(e);
  }
}
