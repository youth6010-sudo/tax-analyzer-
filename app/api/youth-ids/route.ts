import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { assertYouthIdsIpAllowed } from '@/lib/youthIdsAccess';
import { loadYouthIdsAsync, parseYouthIdDoc, saveYouthIdsAsync } from '@/lib/youthIdsDb';
import {
  canEditAllYouthIds,
  mergeYouthIdDocForUser,
  visibleForUser,
  type YouthIdDoc,
} from '@/lib/youthIds';
import type { SessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertAccess(): Promise<
  { error: NextResponse; user?: undefined } | { error?: undefined; user: SessionUser }
> {
  const hdrs = await headers();
  if (!assertYouthIdsIpAllowed(hdrs)) {
    return {
      error: NextResponse.json(
        { error: '회사 네트워크에서만 이용할 수 있습니다.' },
        { status: 403 },
      ),
    };
  }
  try {
    const user = await requireUser();
    return { user };
  } catch {
    return {
      error: NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 }),
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const access = await assertAccess();
    if (access.error) return access.error;
    const { user } = access;

    const doc = await loadYouthIdsAsync();
    const wantAll = request.nextUrl.searchParams.get('view') === 'all';
    const categories = wantAll ? doc.categories : visibleForUser(doc, user.name);

    return NextResponse.json(
      {
        categories,
        canViewAll: true,
        canEditAll: canEditAllYouthIds(user.name),
        view: wantAll ? 'all' : 'mine',
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    console.error('[youth-ids GET]', e);
    return NextResponse.json({ error: '자료를 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await assertAccess();
    if (access.error) return access.error;
    const { user } = access;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
    }

    const incoming = parseYouthIdDoc(body) as YouthIdDoc;
    if (!incoming.categories.length) {
      return NextResponse.json({ error: '카테고리가 비어 있습니다.' }, { status: 400 });
    }

    const existing = await loadYouthIdsAsync();
    const canEditAll = canEditAllYouthIds(user.name);
    const wantAll = request.nextUrl.searchParams.get('view') === 'all';
    const merged = mergeYouthIdDocForUser(existing, incoming, user.name, canEditAll, wantAll);
    const saved = await saveYouthIdsAsync(merged);

    const categories = wantAll ? saved.categories : visibleForUser(saved, user.name);

    return NextResponse.json({
      ok: true,
      doc: { categories },
      canViewAll: true,
      canEditAll,
    });
  } catch (e) {
    console.error('[youth-ids PUT]', e);
    return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
  }
}
