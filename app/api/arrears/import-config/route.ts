import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { getImportConfigForApi } from '@/lib/arrearsImportApply';
import {
  normalizeDotDate,
  toIsoDate,
  writeArrearsImportConfig,
} from '@/lib/arrearsImportConfig';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function GET() {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    const config = await getImportConfigForApi();
    return NextResponse.json(config, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      statusAsOfDate?: string;
      letterCutoffDate?: string;
    };
    const config = writeArrearsImportConfig({
      statusAsOfDate: body.statusAsOfDate ? normalizeDotDate(body.statusAsOfDate) : undefined,
      letterCutoffDate: body.letterCutoffDate ? normalizeDotDate(body.letterCutoffDate) : undefined,
    });

    // 조회 기준일 = 사용자가 입력한 기준일
    if (body.statusAsOfDate) {
      const asOfIso = toIsoDate(config.statusAsOfDate);
      const actor = user.name?.trim() || 'import-config';
      await getDb()
        .update(arrearsEntries)
        .set({ asOfDate: asOfIso, updatedBy: actor, updatedAt: new Date() });
    }

    return NextResponse.json(config, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
