import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { canToggleAdminMode } from '@/lib/masterAccess';
import {
  getNoticeGlobalDefaults,
  setNoticeGlobalDefaults,
  type NoticeGlobalDefaults,
} from '@/lib/noticeDefaultTemplatesDb';

/** 전역 기본 서식 조회 — 모든 로그인 사용자 */
export async function GET() {
  try {
    await requireUser();
    const defaults = await getNoticeGlobalDefaults();
    return NextResponse.json({ defaults });
  } catch (e) {
    return handleApiError(e);
  }
}

/** 전역 기본 서식 저장 — 리아 + 관리자 모드만 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!canToggleAdminMode(user) || !user.adminMode) {
      return NextResponse.json(
        { error: '리아 관리자 모드에서만 기본 서식을 수정할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      defaults?: Partial<NoticeGlobalDefaults>;
    };
    if (!body.defaults || typeof body.defaults !== 'object') {
      return NextResponse.json({ error: 'defaults required' }, { status: 400 });
    }

    const defaults = await setNoticeGlobalDefaults(body.defaults);
    return NextResponse.json({ ok: true, defaults });
  } catch (e) {
    return handleApiError(e);
  }
}
