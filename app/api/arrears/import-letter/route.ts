import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { parseArrearsLetterWorkbookFile } from '@/lib/arrearsLetterParse';
import { previewLetterImport, upsertLetterImport } from '@/lib/arrearsLetterDb';
import type { ParsedLetterSheet } from '@/lib/arrearsLetterParse';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

function collectFiles(form: FormData): File[] {
  const out: File[] = [];
  for (const [key, val] of form.entries()) {
    if (!(val instanceof File)) continue;
    if (key === 'file' || key === 'files' || key.startsWith('file')) {
      if (val.size > 0 && val.name) out.push(val);
    }
  }
  // form.getAll('files')
  for (const v of form.getAll('files')) {
    if (v instanceof File && v.size > 0 && !out.includes(v)) out.push(v);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '공문 내역 가져오기는 인디·찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const form = await req.formData();
    const files = collectFiles(form);
    if (!files.length) {
      return NextResponse.json({ error: '엑셀 파일을 선택해 주세요.' }, { status: 400 });
    }

    const confirm =
      form.get('confirm') === '1' ||
      form.get('confirm') === 'true' ||
      String(form.get('confirm') ?? '').toLowerCase() === 'yes';

    const unmatchedCreate =
      form.get('unmatchedCreate') === '1' || form.get('unmatchedCreate') === 'true';

    const forceManager = String(form.get('managerName') || '').trim();
    const allSheets: Array<ParsedLetterSheet & { managerName: string; filename: string }> = [];
    const fileSummaries: Array<{
      filename: string;
      managerName: string;
      sheetCount: number;
    }> = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      let parsed;
      try {
        parsed = parseArrearsLetterWorkbookFile(buffer, file.name || '');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '파싱 실패';
        return NextResponse.json(
          { error: `${file.name}: ${msg}` },
          { status: 400 },
        );
      }
      if (!parsed.sheets.length) {
        return NextResponse.json(
          {
            error: `${file.name}: 공문 내역 시트를 찾지 못했습니다. (시트=상호, 표=내역·금액)`,
          },
          { status: 400 },
        );
      }
      const managerName = forceManager || parsed.managerName;
      fileSummaries.push({
        filename: file.name,
        managerName,
        sheetCount: parsed.sheets.length,
      });
      for (const s of parsed.sheets) {
        allSheets.push({ ...s, managerName, filename: file.name });
      }
    }

    // manager별로 묶어 preview/upsert (담당 힌트는 파일별)
    if (!confirm) {
      let matched = 0;
      let unmatched = 0;
      let totalLines = 0;
      const sample: Awaited<ReturnType<typeof previewLetterImport>>['sheets'] = [];

      const byManager = new Map<string, ParsedLetterSheet[]>();
      for (const s of allSheets) {
        const key = s.managerName || '';
        const list = byManager.get(key) ?? [];
        list.push(s);
        byManager.set(key, list);
      }

      for (const [mgr, sheets] of byManager) {
        const preview = await previewLetterImport(sheets, mgr);
        matched += preview.matched;
        unmatched += preview.unmatched;
        totalLines += preview.totalLines;
        sample.push(...preview.sheets);
      }

      return NextResponse.json(
        {
          preview: true,
          files: fileSummaries,
          filename: fileSummaries.map(f => f.filename).join(', '),
          managerName: forceManager || fileSummaries.map(f => f.managerName).filter(Boolean).join(', '),
          sheetCount: allSheets.length,
          matched,
          unmatched,
          totalLines,
          sample: sample.slice(0, 60),
        },
        NO_STORE,
      );
    }

    const actor = user.name || user.loginId || '';
    let updated = 0;
    let created = 0;
    let skipped = 0;
    let totalLines = 0;

    const byManager = new Map<string, ParsedLetterSheet[]>();
    for (const s of allSheets) {
      const key = s.managerName || '';
      const list = byManager.get(key) ?? [];
      list.push(s);
      byManager.set(key, list);
    }

    for (const [mgr, sheets] of byManager) {
      const result = await upsertLetterImport(sheets, mgr, actor, {
        unmatchedCreate,
        syncBalance: true,
      });
      updated += result.updated;
      created += result.created;
      skipped += result.skipped;
      totalLines += result.totalLines;
    }

    return NextResponse.json(
      {
        preview: false,
        files: fileSummaries,
        filename: fileSummaries.map(f => f.filename).join(', '),
        sheetCount: allSheets.length,
        updated,
        created,
        skipped,
        totalLines,
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
