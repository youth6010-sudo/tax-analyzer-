import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isReviewMaster } from '@/lib/review/access';
import {
  addReviewNewRow,
  listReviewNewRows,
  removeReviewNewRow,
  type ReviewNewRowInput,
} from '@/lib/review/reviewGridDb';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/new-rows]', e);
  const message = e instanceof Error ? e.message : 'Server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    await requireUser();
    const newRows = await listReviewNewRows();
    return NextResponse.json({ newRows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!isReviewMaster(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as { row?: ReviewNewRowInput };
    if (!body.row?.id) {
      return NextResponse.json({ error: 'row.id required' }, { status: 400 });
    }

    await addReviewNewRow(body.row, user.id);
    const newRows = await listReviewNewRows();
    return NextResponse.json({ newRows });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!isReviewMaster(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    await removeReviewNewRow(id);
    const newRows = await listReviewNewRows();
    return NextResponse.json({ newRows });
  } catch (e) {
    return apiError(e);
  }
}
