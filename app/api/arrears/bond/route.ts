import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { handleApiError } from '@/lib/apiError';
import { nextNoticeDocNo, readBondContact, readBondRecords, updateBondRecords } from '@/lib/bondMgmtDb';
import type { BondRecordPatch, BondStoredRecord } from '@/app/types/bond';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

async function payload(records?: Record<string, BondStoredRecord>) {
  const recs = records ?? (await readBondRecords());
  return {
    records: recs,
    contact: await readBondContact(),
    nextDocNo: nextNoticeDocNo(recs, new Date().getFullYear()),
  };
}

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await payload(), NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      updates?: Array<{ id?: string; patch?: BondRecordPatch; appendNotice?: unknown }>;
      contact?: unknown;
    };
    const updates = (body.updates ?? [])
      .filter(u => u?.id && (u.patch || u.appendNotice))
      .map(u => ({ id: String(u.id), patch: u.patch ?? {}, appendNotice: u.appendNotice }));
    if (!updates.length && body.contact === undefined) {
      return NextResponse.json({ error: 'updates 필요' }, { status: 400 });
    }
    const records = await updateBondRecords(updates, user, canManageArrears(user), body.contact);
    return NextResponse.json(await payload(records), NO_STORE);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: '본인 담당 업체만 수정할 수 있습니다.' }, { status: 403 });
    }
    if (msg === 'NOT_FOUND') {
      return NextResponse.json({ error: '미수관리 항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    return handleApiError(e);
  }
}
