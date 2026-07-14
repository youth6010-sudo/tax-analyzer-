import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  getEditableSheetNamesForOwner,
  getReviewAccessForUser,
  isReviewMaster,
  reviewAccess,
} from '@/lib/review/access';

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
import {
  clearReviewGridEdits,
  listReviewNewRows,
  listReviewPatches,
  replaceReviewNewRows,
  upsertReviewPatches,
  type ReviewNewRowInput,
  type ReviewPatchInput,
} from '@/lib/review/reviewGridDb';

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
      if (!access.canEditLayout) {
        for (const patch of body.patches) {
          if (isLayoutHeaderPatch(patch.sheetName, Number(patch.r))) {
            return NextResponse.json(
              { error: 'Forbidden: 제목행은 인디만 수정할 수 있습니다' },
              { status: 403 },
            );
          }
        }
      }
      await upsertReviewPatches(body.patches, user.id);
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
