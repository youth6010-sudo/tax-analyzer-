import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { applyAdjustmentBulk, previewAdjustmentBulk } from '@/lib/arrearsFeeCharges';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 수임처 조정료 → 미수 일괄 청구 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '조정료 일괄은 인디·찰리·리아(관리자)만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      year?: string | number;
      manager?: string;
      confirm?: boolean | string | number;
    };

    const confirm =
      body.confirm === true || body.confirm === 1 || body.confirm === '1' || body.confirm === 'true';

    if (!confirm) {
      const preview = await previewAdjustmentBulk({
        year: body.year,
        manager: body.manager,
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

    const result = await applyAdjustmentBulk(
      { year: body.year, manager: body.manager },
      user.name || user.loginId || '',
    );
    return NextResponse.json({ preview: false, ...result }, NO_STORE);
  } catch (e) {
    if (e instanceof Error && /year/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handleApiError(e);
  }
}
