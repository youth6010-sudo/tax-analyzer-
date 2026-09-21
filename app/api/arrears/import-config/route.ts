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

/** 목록 기준일(statusAsOfDate)만 수정. 공문 cutoff는 서버에서 동결 유지. */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      statusAsOfDate?: string;
    };
    const asOfRaw = String(body.statusAsOfDate ?? '').trim();
    if (!asOfRaw || !normalizeDotDate(asOfRaw)) {
      return NextResponse.json({ error: '기준일을 확인해 주세요. (예: 2026.08.31)' }, { status: 400 });
    }

    const config = await writeArrearsImportConfig({ statusAsOfDate: asOfRaw });
    const asOfIso = toIsoDate(config.statusAsOfDate);
    const actor = user.name?.trim() || 'import-config';
    await getDb()
      .update(arrearsEntries)
      .set({ asOfDate: asOfIso, updatedBy: actor, updatedAt: new Date() });

    return NextResponse.json(config, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
