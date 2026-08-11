import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canUseCharlieFeatures } from '@/lib/masterAccess';
import {
  asOfDateFromLedgerFilename,
  parseLedgerArrearsWorkbook,
} from '@/lib/arrearsLedgerParse';
import { applyLedgerWithLetterLinks } from '@/lib/arrearsRestart';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 찰리: 원장 xls 확정 반영 + 링크된 공문 부착 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canUseCharlieFeatures(user)) {
      return NextResponse.json(
        { error: '원장 확정 반영은 찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const form = await req.formData();
    const file = form.get('file') || form.get('ledger');
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json(
        { error: '거래처원장 엑셀 파일을 선택해 주세요.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ledgerRows = parseLedgerArrearsWorkbook(buffer);
    if (!ledgerRows.length) {
      return NextResponse.json({ error: '원장에서 미수 행을 찾지 못했습니다.' }, { status: 400 });
    }

    const asOfDate = asOfDateFromLedgerFilename(file.name || '');
    const result = await applyLedgerWithLetterLinks({
      ledgerRows,
      asOfDate,
      actorName: user.name?.trim() || '찰리',
      keepUnmatchedLetters: form.get('dropUnmatched') !== '1',
    });

    return NextResponse.json({ ok: true, asOfDate, ...result }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
