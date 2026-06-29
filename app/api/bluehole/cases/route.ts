// 블루홀 케이스 목록/검색 (허브). 기본은 로그인 계정 권한 기준(내 지점/팀).
//   GET [?q=제목][&assignedBy=수행자id][&clientId][&limit] → { rows: [...], total }
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import * as bh from '@/lib/bluehole/core.js';
import { CASE_COLUMNS } from '@/lib/bluehole/case-api.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

const CREATABLE_COLUMNS: ReadonlySet<string> = new Set(CASE_COLUMNS as string[]);

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  if (!(await blueholeConfiguredForUser(user.id))) {
    return NextResponse.json({ error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  const assignedBy = (sp.get('assignedBy') || '').trim();
  const clientId = (sp.get('clientId') || '').trim();
  const statusCode = (sp.get('status') || '').trim();
  const limit = Math.min(Number(sp.get('limit')) || 500, 2000);

  const filters: Record<string, string | number> = { limit };
  if (q) filters.q = q;
  if (assignedBy) filters.assigned_by = assignedBy;
  if (clientId) filters.client_id = clientId;
  if (statusCode) filters.status_code = statusCode;

  try {
    const data = (await withBluehole(user.id, (cookie) => bh.listCases(cookie, filters))) as {
      rows?: unknown[];
      total?: number;
    };
    return NextResponse.json({ rows: data.rows || [], total: data.total || 0 }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '블루홀 호출 오류' }, { status: 500 });
  }
}

// 케이스 신규 생성 (영구 · 삭제불가). subject 필수.
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

  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, unknown> };
  const values: Record<string, string> = {};
  for (const [col, val] of Object.entries(body.values || {})) {
    if (CREATABLE_COLUMNS.has(col) && val != null && String(val).trim() !== '') values[col] = String(val).trim();
  }
  if (!values.subject) {
    return NextResponse.json({ error: '케이스 제목(subject)은 필수입니다.' }, { status: 400 });
  }

  try {
    const result = (await withBluehole(user.id, (cookie) => bh.createCase(cookie, values))) as {
      newId?: string;
      caseUrl?: string;
    };

    await insertBlueholeSyncLog({
      clientId: '',
      blueholeClientId: result.newId ? `case:${result.newId}` : 'case:new',
      action: 'create',
      userId: user.id,
      userName: user.name || '',
      changes: values,
      successCols: Object.keys(values),
      warnings: [],
    }).catch(() => {});

    return NextResponse.json({ newId: result.newId || '', caseUrl: result.caseUrl || '' }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '케이스 생성 오류' }, { status: 500 });
  }
}
