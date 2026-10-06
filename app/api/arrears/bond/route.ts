import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { handleApiError } from '@/lib/apiError';
import {
  listBondContacts,
  nextNoticeDocNo,
  nextNoticeDocNos,
  readBondContact,
  readBondDocLog,
  readBondDocSeq,
  readBondNoticeDefaults,
  readBondNoticeDefaultsLog,
  readBondRecords,
  updateBondRecords,
  writeBondNoticeDefaults,
} from '@/lib/bondMgmtDb';
import type { BondRecordPatch, BondStoredRecord } from '@/app/types/bond';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

async function payload(records?: Record<string, BondStoredRecord>) {
  const recs = records ?? (await readBondRecords());
  const contact = await readBondContact();
  const docSeq = await readBondDocSeq();
  const year = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }));
  return {
    records: recs,
    contact,
    contacts: listBondContacts(recs, contact),
    nextDocNo: nextNoticeDocNo(recs, year, docSeq),
    docNoOptions: nextNoticeDocNos(recs, year, docSeq),
    docLog: await readBondDocLog(),
    noticeDefaults: await readBondNoticeDefaults(),
    noticeDefaultsLog: await readBondNoticeDefaultsLog(),
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
      /** PDF로 만든 해임통보 문서번호 — 연도별 카운터 갱신 */
      usedDocNo?: unknown;
      /** 발급 대장에 남길 안내문 정보 (usedDocNo와 함께) */
      issue?: unknown;
      /** 해임통보 발신일자·입금기한 일괄값 — 미수 관리권한자만 */
      noticeDefaults?: unknown;
    };
    if (body.noticeDefaults !== undefined) {
      if (!canManageArrears(user)) {
        return NextResponse.json({ error: '일괄 날짜는 관리자만 지정할 수 있습니다.' }, { status: 403 });
      }
      await writeBondNoticeDefaults(body.noticeDefaults, user);
      return NextResponse.json(await payload(), NO_STORE);
    }
    const updates = (body.updates ?? [])
      .filter(u => u?.id && (u.patch || u.appendNotice))
      .map(u => ({ id: String(u.id), patch: u.patch ?? {}, appendNotice: u.appendNotice }));
    if (!updates.length && body.contact === undefined && body.usedDocNo === undefined) {
      return NextResponse.json({ error: 'updates 필요' }, { status: 400 });
    }
    const records = await updateBondRecords(updates, user, canManageArrears(user), body.contact, body.usedDocNo, body.issue);
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
