import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listStaffPresence, PRESENCE_ONLINE_MS, touchPresence } from '@/lib/presence';

/** 로그인 직원 목록 + 온라인 여부 (인증 필요) */
export async function GET() {
  try {
    await requireUser();
    const staff = await listStaffPresence();
    return NextResponse.json({
      onlineWindowMs: PRESENCE_ONLINE_MS,
      staff,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('presence GET', e);
    return NextResponse.json({ error: '접속 상태를 불러오지 못했습니다.' }, { status: 500 });
  }
}

/** heartbeat — last_seen_at 갱신 */
export async function POST() {
  try {
    const user = await requireUser();
    await touchPresence(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('presence POST', e);
    return NextResponse.json({ error: 'heartbeat 실패' }, { status: 500 });
  }
}
