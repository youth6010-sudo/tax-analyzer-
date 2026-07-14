import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  getEditableSheetNamesForOwner,
  getReviewAccessForUser,
  isReviewMaster,
  reviewAccess,
} from '@/lib/review/access';
import {
  clearReviewGridEdits,
  listReviewNewRows,
  listReviewPatches,
  replaceReviewNewRows,
  upsertReviewPatches,
  type ReviewNewRowInput,
  type ReviewPatchInput,
} from '@/lib/review/reviewGridDb';

/** 결산 엑셀 제목행 — 종소 1행, 법인·수수료 1~2행 */
function isLayoutHeaderPatch(sheetName: string, row: number): boolean {
  if (!Number.isFinite(row) || row < 1) return false;
  const corpSheets = new Set<string>();
  if (reviewAccess.corpSheet) corpSheets.add(reviewAccess.corpSheet);
  if (reviewAccess.corpFeeSheet) corpSheets.add(reviewAccess.corpFeeSheet);
  for (const ver of reviewAccess.corpTaxVersions || []) {
    if (ver.sheet) corpSheets.add(ver.sheet);
  }
  if (corpSheets.has(sheetName)) return row <= 2;
  return row <= 1;
}

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/patches]', e);
  const message = e instanceof Error ? e.message : 'Server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    await requireUser();
    const [patches, newRows] = await Promise.all([listReviewPatches(), listReviewNewRows()]);
    return NextResponse.json({ patches, newRows });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const access = getReviewAccessForUser(user);
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      patches?: ReviewPatchInput[];
      newRows?: ReviewNewRowInput[];
    };

    if (!access.isMaster && Array.isArray(body.patches)) {
      const allowed = new Set(getEditableSheetNamesForOwner(access.reviewOwner));
      for (const patch of body.patches) {
        if (!allowed.has(patch.sheetName)) {
          return NextResponse.json({ error: 'Forbidden: sheet' }, { status: 403 });
        }
      }
    }

    if (!access.isMaster && Array.isArray(body.newRows)) {
      for (const row of body.newRows) {
        const owner = row.owner ? String(row.owner).trim() : '';
        if (owner && owner !== access.reviewOwner) {
          return NextResponse.json({ error: 'Forbidden: new row owner' }, { status: 403 });
        }
      }
    }

    if (Array.isArray(body.patches)) {
      // 클라이언트는 매번 전체 패치 목록을 보냄.
      // 제목행 패치가 목록에 있어도(인디가 예전에 저장한 것 포함)
      // 비인디는 본문만 upsert — 전체 저장을 막지 않음.
      const patchesToSave = access.canEditLayout
        ? body.patches
        : body.patches.filter(p => !isLayoutHeaderPatch(p.sheetName, Number(p.r)));
      if (patchesToSave.length) {
        await upsertReviewPatches(patchesToSave, user.id);
      }
    }
    if (Array.isArray(body.newRows)) {
      await replaceReviewNewRows(body.newRows, user.id);
    }

    const [patches, newRows] = await Promise.all([listReviewPatches(), listReviewNewRows()]);
    return NextResponse.json({ patches, newRows });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    if (!isReviewMaster(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await clearReviewGridEdits();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
