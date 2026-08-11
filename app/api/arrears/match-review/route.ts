import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { canUseCharlieFeatures } from '@/lib/masterAccess';
import {
  buildMatchReview,
  scanLetterSheetsFromBuffers,
} from '@/lib/arrearsMatchReview';
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
  for (const v of form.getAll('files')) {
    if (v instanceof File && v.size > 0 && !out.includes(v)) out.push(v);
  }
  return out;
}

/** 디스크(로컬 Z:) 스캔 — Vercel에서는 보통 비어 있음 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const review = await buildMatchReview();
    return NextResponse.json(
      {
        ...review,
        canLink: canUseCharlieFeatures(user),
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

/** 공문 xls 업로드 후 이름 맞추기 목록 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const form = await req.formData();
    const files = collectFiles(form);
    if (!files.length) {
      return NextResponse.json(
        { error: '담당자 미수 공문 엑셀(xls)을 선택해 주세요.' },
        { status: 400 },
      );
    }

    const buffers: Array<{ filename: string; buffer: Buffer }> = [];
    for (const file of files) {
      buffers.push({
        filename: file.name || 'letter.xls',
        buffer: Buffer.from(await file.arrayBuffer()),
      });
    }

    let scanned;
    try {
      scanned = scanLetterSheetsFromBuffers(buffers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '공문 파싱 실패';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!scanned.length) {
      return NextResponse.json(
        { error: '공문 내역 시트를 찾지 못했습니다. (시트=상호, 열=내역·금액)' },
        { status: 400 },
      );
    }

    const review = await buildMatchReview({
      scanned,
      sourceLabel: `업로드 ${files.length}개 파일`,
    });

    return NextResponse.json(
      {
        ...review,
        canLink: canUseCharlieFeatures(user),
        uploadedFiles: files.map(f => f.name),
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
