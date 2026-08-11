import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { applyLedgerBackfill, previewLedgerBackfill } from '@/lib/arrearsFeeCharges';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 원장반영만 있는 행 → 수임처 기장료×개월 분해 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '원장 분해는 인디·찰리·리아(관리자)만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      manager?: string;
      endYearMonth?: string;
      entryIds?: string[];
      confirm?: boolean | string | number;
    };

    const confirm =
      body.confirm === true || body.confirm === 1 || body.confirm === '1' || body.confirm === 'true';

    if (!confirm) {
      const preview = await previewLedgerBackfill({
        manager: body.manager,
        endYearMonth: body.endYearMonth,
      });
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

    const result = await applyLedgerBackfill(
      {
        manager: body.manager,
        endYearMonth: body.endYearMonth,
        entryIds: Array.isArray(body.entryIds) ? body.entryIds : undefined,
      },
      user.name || user.loginId || '',
    );
    return NextResponse.json({ preview: false, ...result }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
