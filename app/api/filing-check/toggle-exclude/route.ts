import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isMasterUser } from '@/lib/clientAccess';
import {
  toggleWithholdingClientExclusion,
  toggleWithholdingClientExclusionForYear,
} from '@/lib/taxFilingChecksDb';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      manager?: string;
      periodKey?: string;
      year?: number;
      clientId?: string;
      scope?: 'month' | 'year';
    };

    const manager = body.manager ?? user.name;
    const clientId = body.clientId ?? '';

    if (!clientId) {
      return NextResponse.json({ error: 'clientId required' }, { status: 400 });
    }

    if (!isMasterUser(user) && manager !== user.name && manager !== '전체') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const effectiveManager = manager === '전체' ? user.name : manager;

    if (body.scope === 'year' && body.year) {
      const excluded = await toggleWithholdingClientExclusionForYear(
        effectiveManager,
        body.year,
        clientId,
        user.id,
      );
      return NextResponse.json({ excluded });
    }

    const periodKey = body.periodKey ?? '';
    if (!periodKey) {
      return NextResponse.json({ error: 'periodKey required' }, { status: 400 });
    }

    const excluded = await toggleWithholdingClientExclusion(
      effectiveManager,
      periodKey,
      clientId,
      user.id,
    );
    return NextResponse.json({ excluded });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
