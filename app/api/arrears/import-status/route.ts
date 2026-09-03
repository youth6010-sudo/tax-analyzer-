import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { applyStatusImport, previewStatusImport } from '@/lib/arrearsImportApply';
import { assertArrearsUploadFilename } from '@/lib/arrearsImportFilenames';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '현황표 가져오기는 관리자만 할 수 있습니다.' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '현황표 엑셀 파일을 선택해 주세요.' }, { status: 400 });
    }

    let parsedName;
    try {
      parsedName = assertArrearsUploadFilename(file.name || '', 'status');
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : '파일명 오류' },
        { status: 400 },
      );
    }

    const confirm =
      form.get('confirm') === '1' ||
      form.get('confirm') === 'true' ||
      String(form.get('confirm') ?? '').toLowerCase() === 'yes';
    const asOfDate =
      String(form.get('asOfDate') ?? '').trim() || parsedName.asOfDate || undefined;
    const buffer = Buffer.from(await file.arrayBuffer());
    const actor = user.name?.trim() || 'import-status';

    if (!confirm) {
      const preview = await previewStatusImport(buffer, asOfDate);
      return NextResponse.json(preview, NO_STORE);
    }

    const result = await applyStatusImport(buffer, actor, asOfDate);
    return NextResponse.json(result, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
