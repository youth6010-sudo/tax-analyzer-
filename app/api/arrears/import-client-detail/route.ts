import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import {
  applyClientDetailImport,
  previewClientDetailImport,
} from '@/lib/arrearsImportApply';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '거래처별 상세 가져오기는 관리자만 할 수 있습니다.' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '거래처별 현황 엑셀 파일을 선택해 주세요.' }, { status: 400 });
    }

    const confirm =
      form.get('confirm') === '1' ||
      form.get('confirm') === 'true' ||
      String(form.get('confirm') ?? '').toLowerCase() === 'yes';
    const cutoffDate = String(form.get('cutoffDate') ?? '').trim() || undefined;
    const buffer = Buffer.from(await file.arrayBuffer());
    const actor = user.name?.trim() || 'import-client-detail';

    if (!confirm) {
      const preview = await previewClientDetailImport(buffer, cutoffDate);
      return NextResponse.json(preview, NO_STORE);
    }

    const result = await applyClientDetailImport(buffer, actor, cutoffDate);
    return NextResponse.json(result, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
