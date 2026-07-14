import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getReviewAccessForUser } from '@/lib/review/access';
import {
  getReviewListLayouts,
  saveReviewListLayoutKind,
} from '@/lib/reviewListLayoutDb';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/list-layout]', e);
  return NextResponse.json(
    { error: e instanceof Error ? e.message : 'Server error' },
    { status: 500 },
  );
}

export async function GET() {
  try {
    await requireUser();
    const layouts = await getReviewListLayouts();
    return NextResponse.json({ layouts });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const access = getReviewAccessForUser(user);
    if (!access.canEditLayout) {
      return NextResponse.json({ error: 'Forbidden: 인디만 열 구성 변경 가능' }, { status: 403 });
    }
    const body = (await request.json()) as {
      kind?: string;
      order?: Array<string | number>;
    };
    const kind = String(body.kind || '').trim();
    if (!kind || !Array.isArray(body.order)) {
      return NextResponse.json({ error: 'kind and order required' }, { status: 400 });
    }
    const layouts = await saveReviewListLayoutKind(kind, body.order, user.id);
    return NextResponse.json({ ok: true, layouts });
  } catch (e) {
    return apiError(e);
  }
}
