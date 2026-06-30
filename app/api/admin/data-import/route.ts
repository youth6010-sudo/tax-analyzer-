import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { parseOperationalWorkbook } from '@/lib/intakeWorkbookParse';
import { summarizeParsed } from '@/lib/intakeImportDb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 유입·유출 엑셀 미리보기 (DB 변경 없음) */
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
        { error: '유입관리·유입프로세스·유출 시트를 찾을 수 없습니다. 청년들 ID.xlsx 형식인지 확인하세요.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      fileName: file.name,
      summary: summarizeParsed(parsed),
      sample: {
        inquiries: parsed.inquiries.slice(0, 5).map(r => ({ companyName: r.companyName, consultant: r.consultant, inquiryDate: r.inquiryDate })),
        churns: parsed.churns.slice(0, 5).map(r => ({ companyName: r.companyName, manager: r.manager, churnedAt: r.churnedAt })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '엑셀을 분석하지 못했습니다.' },
      { status: 500 },
    );
  }
}
