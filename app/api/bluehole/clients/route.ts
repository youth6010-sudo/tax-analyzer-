// 블루홀 거래처 검색/조회/목록 (수임처 연결 + 허브)
//   GET ?id=거래처ID            → { client: {...} }
//   GET ?q=상호                 → { clients: [...] }            (이름검색, 연결용)
//   GET ?list=1[&branchId&limit&q] → { clients: [...] }         (허브 목록; 기본 내 지점)
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

type ClientField = { col: string };
const CREATABLE_COLUMNS: ReadonlySet<string> = new Set((bh.CLIENT_FIELDS as ClientField[]).map((f) => f.col));

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }

  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json(
      { error: '블루홀 계정이 등록되어 있지 않습니다. 블루홀 페이지에서 계정을 먼저 등록하세요.', code: 'no_account' },
      { status: 400 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const id = (sp.get('id') || '').trim();
  const q = (sp.get('q') || '').trim();
  const list = sp.get('list') === '1';
  const branchId = (sp.get('branchId') || '').trim();
  const limit = Math.min(Number(sp.get('limit')) || 1000, 3000);

  try {
    if (id) {
      const client = await withBluehole(user.id, (cookie) => bh.getClient(cookie, id));
      return NextResponse.json({ client }, NO_STORE);
    }
    if (list) {
      const clients = await withBluehole(user.id, (cookie) => bh.listClients(cookie, { q, branchId, limit }));
      return NextResponse.json({ clients }, NO_STORE);
    }
    if (!q) return NextResponse.json({ clients: [] }, NO_STORE);
    const clients = await withBluehole(user.id, (cookie) => bh.searchClients(cookie, q));
    return NextResponse.json({ clients }, NO_STORE);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '블루홀 호출 오류' },
      { status: 500 },
    );
  }
}

// 거래처 신규 생성 (영구 · 삭제불가). force=false면 사업자번호 중복 시 409.
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json({ error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, unknown>; force?: boolean };
  const values: Record<string, string> = {};
  for (const [col, val] of Object.entries(body.values || {})) {
    if (CREATABLE_COLUMNS.has(col) && val != null && String(val).trim() !== '') values[col] = String(val).trim();
  }
  if (!values.name) {
    return NextResponse.json({ error: '거래처명(name)은 필수입니다.' }, { status: 400 });
  }

  try {
    if (!body.force && values.business_number) {
      const dup = (await withBluehole(user.id, (cookie) =>
        bh.searchClients(cookie, values.business_number),
      )) as Array<{ id: string; name: string; business_number: string }>;
      const candidates = dup.filter((c) => (c.business_number || '').replace(/\D/g, '') === values.business_number.replace(/\D/g, ''));
      if (candidates.length) {
        return NextResponse.json({ duplicate: true, candidates }, { status: 409 });
      }
    }

    const result = (await withBluehole(user.id, (cookie) => bh.createClient(cookie, values))) as {
      newId?: string;
      clientUrl?: string;
    };

    await insertBlueholeSyncLog({
      clientId: '',
      blueholeClientId: result.newId || '',
      action: 'create',
      userId: user.id,
      userName: user.name || '',
      changes: values,
      successCols: Object.keys(values),
      warnings: [],
    }).catch(() => {});

    return NextResponse.json({ newId: result.newId || '', clientUrl: result.clientUrl || '' }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '거래처 생성 오류' }, { status: 500 });
  }
}
