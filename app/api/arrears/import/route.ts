import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import {
  asOfDateFromLedgerFilename,
  parseLedgerArrearsWorkbook,
} from '@/lib/arrearsLedgerParse';
import { previewLedgerImport, upsertLedgerImport } from '@/lib/arrearsDb';
import { previewLedgerLetterDiffs } from '@/lib/arrearsLetterDb';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '원장 가져오기는 인디·찰리·리아(관리자)만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '엑셀 파일을 선택해 주세요.' }, { status: 400 });
    }

    const confirm =
      form.get('confirm') === '1' ||
      form.get('confirm') === 'true' ||
      String(form.get('confirm') ?? '').toLowerCase() === 'yes';

    const buffer = Buffer.from(await file.arrayBuffer());
    let ledgerRows;
    try {
      ledgerRows = parseLedgerArrearsWorkbook(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '파싱 실패';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!ledgerRows.length) {
      return NextResponse.json({ error: '가져올 행이 없습니다.' }, { status: 400 });
    }

    const asOfDate =
      String(form.get('asOfDate') || '').trim() ||
      asOfDateFromLedgerFilename(file.name || '');

    if (!confirm) {
      const preview = await previewLedgerImport(ledgerRows);
      const letterDiffs = await previewLedgerLetterDiffs(ledgerRows);
      return NextResponse.json(
        {
          preview: true,
          asOfDate,
          filename: file.name,
          total: ledgerRows.length,
          matched: preview.matched,
          unmatched: preview.unmatched,
          newCount: preview.newCount,
          /** 원장에 없어 제외되는 기존(현황·공문) */
          preserved: preview.preserved,
          letterDiffCount: letterDiffs.letterDiffCount,
          letterDiffSample: letterDiffs.sample,
          sample: preview.rows.slice(0, 30).map(r => ({
            externalCode: r.externalCode,
            companyName: r.companyName,
            businessNo: r.businessNo,
            balance: r.balance,
            clientId: r.clientId,
            matchedCompanyName: r.matchedCompanyName,
            managerName: r.managerName,
            isNew: r.isNew,
          })),
        },
        NO_STORE,
      );
    }

    const actor = user.name || user.loginId || '';
    const result = await upsertLedgerImport(ledgerRows, asOfDate, actor);
    // 자동 「원장반영」 맞춤 없음 — 불일치는 preview의 letterDiff* 로 확인
    const letterDiffs = await previewLedgerLetterDiffs(ledgerRows);

    return NextResponse.json(
      {
        preview: false,
        asOfDate,
        filename: file.name,
        total: ledgerRows.length,
        letterDiffApplied: 0,
        letterDiffCount: letterDiffs.letterDiffCount,
        letterDiffSample: letterDiffs.sample,
        letterSyncSkipped: true,
        ...result,
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
