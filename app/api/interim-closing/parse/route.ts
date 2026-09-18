import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { parseStatementWorkbook } from '@/lib/interimClosingParse';
import type { StatementKind } from '@/lib/interimClosingTypes';
import { STATEMENT_KINDS } from '@/lib/interimClosingTypes';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get('file');
    const kindRaw = String(form.get('kind') || '');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file 필요' }, { status: 400 });
    }
    const kind = (STATEMENT_KINDS.includes(kindRaw as StatementKind)
      ? kindRaw
      : undefined) as StatementKind | undefined;
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseStatementWorkbook(buf, kind);
    return NextResponse.json({
      kind: kind ?? parsed.kind,
      sheetName: parsed.sheetName,
      lines: parsed.lines,
      count: parsed.lines.length,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
