import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { countClientData, wipeClientData } from '@/lib/clientDataWipe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONFIRM_PHRASE = '수임처 데이터 전체 삭제';

function guardError(e: unknown) {
  if (e instanceof Error && e.message === 'FORBIDDEN') {
    return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** 삭제 대상 건수 미리보기 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return guardError(e);
  }
  const counts = await countClientData();
  return NextResponse.json({ counts, confirmPhrase: CONFIRM_PHRASE });
}

/** 수임처 관련 데이터 전량 삭제 (확인 문구 일치 필요) */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return guardError(e);
  }

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* 무시 */
  }

  if ((body.confirm ?? '').trim() !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `확인 문구가 일치하지 않습니다. "${CONFIRM_PHRASE}"를 정확히 입력하세요.` },
      { status: 400 },
    );
  }

  try {
    const result = await wipeClientData();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '삭제에 실패했습니다.' },
      { status: 500 },
    );
  }
}
