import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clientsDb';
import { isMasterUser } from '@/lib/clientAccess';
import { buildPrimaryClientLinksByKey } from '@/lib/review/clientLinkDb';
import { buildCorpFeeIndex } from '@/lib/review/corpFeeIndex';
import { buildCorpFeeAmountByClientId } from '@/lib/review/corpFeeTypes';
import { buildIncomeFeeByClientId } from '@/lib/review/incomeFeeByClient';

function apiError(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[review/filing-fees]', e);
  return NextResponse.json({ error: 'Server error' }, { status: 500 });
}

/** 신고대상확인용 — 검토표 수수료 (종소·법인) clientId → 금액 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const tax = request.nextUrl.searchParams.get('tax') ?? '';

    if (tax === 'comprehensive') {
      const byClientId = await buildIncomeFeeByClientId();
      return NextResponse.json(
        { byClientId },
        { headers: { 'Cache-Control': 'private, max-age=60' } },
      );
    }

    if (tax === 'corporate') {
      const [index, primaryLinksByKey, clients] = await Promise.all([
        buildCorpFeeIndex(),
        buildPrimaryClientLinksByKey(),
        listClients({
          mineOnly: !isMasterUser(user),
          userId: user.id,
          userName: user.name,
          includeChurned: true,
        }),
      ]);
      const byClientId = buildCorpFeeAmountByClientId(
        clients,
        index.byKey,
        primaryLinksByKey,
      );
      return NextResponse.json(
        { byClientId },
        { headers: { 'Cache-Control': 'private, max-age=60' } },
      );
    }

    return NextResponse.json({ error: 'tax=comprehensive|corporate required' }, { status: 400 });
  } catch (e) {
    return apiError(e);
  }
}
