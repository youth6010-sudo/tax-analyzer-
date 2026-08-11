import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canUseCharlieFeatures } from '@/lib/masterAccess';
import { upsertLetterLedgerLink } from '@/lib/arrearsRestart';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 찰리: 공문 상호 → 원장 코드 링크만 저장 (아직 공문 줄 이동 안 함) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canUseCharlieFeatures(user)) {
      return NextResponse.json(
        { error: '공문·원장 연결은 찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      letterCompanyName?: string;
      letterSoftKey?: string;
      letterFilename?: string;
      managerName?: string;
      ledgerExternalCode?: string;
      ledgerCompanyName?: string;
      status?: 'manual' | 'skip';
    };

    const letterCompanyName = String(body.letterCompanyName || '').trim();
    const status = body.status === 'skip' ? 'skip' : 'manual';
    const ledgerExternalCode = String(body.ledgerExternalCode || '').trim();
    const ledgerCompanyName = String(body.ledgerCompanyName || '').trim();

    if (!letterCompanyName) {
      return NextResponse.json({ error: 'letterCompanyName 이 필요합니다.' }, { status: 400 });
    }
    if (status === 'manual' && !ledgerExternalCode) {
      return NextResponse.json({ error: 'ledgerExternalCode 가 필요합니다.' }, { status: 400 });
    }

    await upsertLetterLedgerLink({
      letterSoftKey: String(body.letterSoftKey || letterCompanyName).trim(),
      letterCompanyName,
      letterFilename: String(body.letterFilename || '').trim(),
      managerName: String(body.managerName || '').trim(),
      ledgerExternalCode,
      ledgerCompanyName,
      status,
      actorName: user.name?.trim() || '찰리',
    });

    return NextResponse.json({ ok: true, status }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
