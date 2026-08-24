import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { assertYouthIdsIpAllowed } from '@/lib/youthIdsAccess';
import { loadYouthIdsAsync, parseYouthIdDoc, saveYouthIdsAsync } from '@/lib/youthIdsDb';
import type { YouthIdDoc } from '@/lib/youthIds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertAccess() {
  const hdrs = await headers();
  if (!assertYouthIdsIpAllowed(hdrs)) {
    return NextResponse.json(
      { error: '회사 네트워크에서만 이용할 수 있습니다.' },
      { status: 403 },
    );
  }
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const denied = await assertAccess();
  if (denied) return denied;
  const doc = await loadYouthIdsAsync();
  return NextResponse.json(doc, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: NextRequest) {
  const denied = await assertAccess();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }

  const doc = parseYouthIdDoc(body) as YouthIdDoc;
  if (!doc.categories.length) {
    return NextResponse.json({ error: '카테고리가 비어 있습니다.' }, { status: 400 });
  }

  const saved = await saveYouthIdsAsync(doc);
  return NextResponse.json({ ok: true, doc: saved });
}
