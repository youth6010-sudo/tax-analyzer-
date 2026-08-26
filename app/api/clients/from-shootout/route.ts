import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createClientFromShootout, findUserByName } from '@/lib/clientsDb';
import { getUserMenuPrefs } from '@/lib/menuPrefsDb';

/** 신규 담당 승부차기 당첨 → 수임처 생성 */
export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const manager = typeof body.manager === 'string' ? body.manager.trim() : '';
    const entity =
      body.entity === 'corporate' || body.entity === 'individual' ? body.entity : null;

    if (!companyName) {
      return NextResponse.json({ error: '상호를 입력해 주세요.' }, { status: 400 });
    }
    if (!manager) {
      return NextResponse.json({ error: '담당자가 없습니다.' }, { status: 400 });
    }
    if (!entity) {
      return NextResponse.json({ error: '개인/법인을 선택해 주세요.' }, { status: 400 });
    }

    const winnerUser = await findUserByName(manager);
    if (!winnerUser) {
      return NextResponse.json({ error: '담당자 계정을 찾을 수 없습니다.' }, { status: 400 });
    }

    const prefs = await getUserMenuPrefs(winnerUser.id);
    const accept = prefs.acceptNewClients ?? { individual: false, corporate: false };
    const ok = entity === 'corporate' ? accept.corporate : accept.individual;
    if (!ok) {
      return NextResponse.json(
        { error: '당첨 담당자가 해당 유형 신규수신을 받지 않습니다.' },
        { status: 400 },
      );
    }

    const client = await createClientFromShootout({
      companyName,
      manager,
      entity,
      assignedUserId: winnerUser.id,
    });

    return NextResponse.json({ client }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('clients/from-shootout POST', e);
    return NextResponse.json({ error: '수임처를 만들지 못했습니다.' }, { status: 500 });
  }
}
