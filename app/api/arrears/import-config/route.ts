import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import {
  getImportConfigForApi,
} from '@/lib/arrearsImportApply';
import {
  normalizeDotDate,
  writeArrearsImportConfig,
} from '@/lib/arrearsImportConfig';
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
    return NextResponse.json(config, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
