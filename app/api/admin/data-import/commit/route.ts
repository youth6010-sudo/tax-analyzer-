import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { parseOperationalWorkbook } from '@/lib/intakeWorkbookParse';
import { importOperationalData } from '@/lib/intakeImportDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 유입·유출 엑셀을 실제로 DB에 반영 (upsert) */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '엑셀 파일을 선택하세요.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseOperationalWorkbook(buffer);

    if (!parsed.sheets.inquiries && !parsed.sheets.processes && !parsed.sheets.churns) {
      return NextResponse.json(
        { error: '유입관리·유입프로세스·유출 시트를 찾을 수 없습니다.' },
        { status: 400 },
      );
    }

    const stats = await importOperationalData(parsed);
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '엑셀 반영에 실패했습니다.' },
      { status: 500 },
    );
  }
}
