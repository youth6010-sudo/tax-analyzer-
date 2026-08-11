import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { canUseCharlieFeatures } from '@/lib/masterAccess';
import { parseLedgerArrearsWorkbook } from '@/lib/arrearsLedgerParse';
import { buildRestartMatchReview } from '@/lib/arrearsRestart';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/**
 * 재시작 모드: DB의 공문 행 vs 업로드한 원장 xls (원장은 DB에 넣지 않음)
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file') || form.get('ledger') || form.get('files');
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json(
        { error: '거래처원장 엑셀 파일을 선택해 주세요.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let ledgerRows;
    try {
      ledgerRows = parseLedgerArrearsWorkbook(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '원장 파싱 실패';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!ledgerRows.length) {
      return NextResponse.json({ error: '원장에서 미수 행을 찾지 못했습니다.' }, { status: 400 });
    }

    const review = await buildRestartMatchReview(ledgerRows, {
      seedAutoLinks: true,
      actorName: user.name?.trim() || 'system',
    });

    return NextResponse.json(
      {
        mode: 'restart',
        ledgerFilename: file.name,
        ...review,
        canLink: canUseCharlieFeatures(user),
        canApply: canUseCharlieFeatures(user),
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
