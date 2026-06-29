// 블루홀 케이스 단건 조회/수정 (허브).
//   GET   → { case: {라벨/제목/내용}, codes: {수정용 코드값} }
//   PATCH { changes: { <컬럼>: 값 } } → updateCase (CASE_COLUMNS 화이트리스트, 재수정 가능)
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

const EDITABLE_COLUMNS: ReadonlySet<string> = new Set(bh.CASE_COLUMNS as string[]);

async function ensure() {
  const user = await requireUser();
  if (!(await blueholeConfiguredForUser(user.id))) return { user, ok: false as const };
  return { user, ok: true as const };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let a;
  try {
    a = await ensure();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  if (!a.ok) return NextResponse.json({ error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' }, { status: 400 });
  const { id } = await params;
  try {
    const data = (await withBluehole(a.user.id, (cookie) => bh.getCase(cookie, id))) as Record<string, unknown> & {
      codes?: Record<string, string>;
    };
    const { codes = {}, ...rest } = data;
    return NextResponse.json({ case: rest, codes }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '블루홀 호출 오류' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let a;
  try {
    a = await ensure();
  } catch {
    return NextResponse.json({ error: '포털 로그인이 필요합니다.' }, { status: 401 });
  }
  if (!a.ok) return NextResponse.json({ error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' }, { status: 400 });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { changes?: Record<string, unknown> };
  const changes: Record<string, string> = {};
  for (const [col, val] of Object.entries(body.changes || {})) {
    if (EDITABLE_COLUMNS.has(col)) changes[col] = val == null ? '' : String(val);
  }
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: '반영할 항목이 없습니다.' }, { status: 400 });
  }

  try {
    const result = (await withBluehole(a.user.id, (cookie) => bh.updateCase(cookie, id, changes))) as {
      success_cols?: string[];
      warnings?: string[];
    };
    const successCols = result.success_cols || [];
    const warnings = result.warnings || [];

    await insertBlueholeSyncLog({
      clientId: '',
      blueholeClientId: `case:${id}`,
      action: 'update',
      userId: a.user.id,
      userName: a.user.name || '',
      changes,
      successCols,
      warnings,
    }).catch(() => {});

    return NextResponse.json({ successCols, warnings }, NO_STORE);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '블루홀 호출 오류' }, { status: 500 });
  }
}
