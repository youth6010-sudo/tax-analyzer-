import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getReviewAccessForUser } from '@/lib/review/access';
import {
  getReviewListLayoutFull,
  saveReviewListLayoutKind,
  saveReviewListWidthsKind,
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
    const { layouts, widths } = await getReviewListLayoutFull();
    return NextResponse.json({ layouts, widths });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const access = getReviewAccessForUser(user);
    if (!access.canEditLayout) {
      return NextResponse.json(
        { error: 'Forbidden: 인디·개발자만 열 구성 변경 가능' },
        { status: 403 },
      );
    }
    const body = (await request.json()) as {
      kind?: string;
      order?: Array<string | number>;
      widths?: Record<string, number>;
    };
    const kind = String(body.kind || '').trim();
    if (!kind) {
      return NextResponse.json({ error: 'kind required' }, { status: 400 });
    }
    if (!Array.isArray(body.order) && !(body.widths && typeof body.widths === 'object')) {
      return NextResponse.json({ error: 'order or widths required' }, { status: 400 });
    }

    let layouts;
    let widths;
    if (Array.isArray(body.order)) {
      layouts = await saveReviewListLayoutKind(kind, body.order, user.id);
    }
    if (body.widths && typeof body.widths === 'object') {
      widths = await saveReviewListWidthsKind(kind, body.widths, user.id);
    }
    const full = await getReviewListLayoutFull();
    return NextResponse.json({
      ok: true,
      layouts: layouts ?? full.layouts,
      widths: widths ?? full.widths,
    });
  } catch (e) {
    return apiError(e);
  }
}
