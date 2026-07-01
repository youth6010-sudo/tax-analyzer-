import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { isMasterUser } from '@/lib/clientAccess';
import {
  getFilingCheckSession,
  upsertFilingCheckSession,
  type FilingCheckSessionData,
} from '@/lib/taxFilingChecksDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const manager = searchParams.get('manager') ?? '';
    const taxType = searchParams.get('taxType') ?? '';
    const periodKey = searchParams.get('periodKey') ?? '';

    if (!manager || !taxType || !periodKey) {
      return NextResponse.json({ error: 'manager, taxType, periodKey required' }, { status: 400 });
    }

    if (!isMasterUser(user) && manager !== user.name && manager !== '전체') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await getFilingCheckSession(manager, taxType, periodKey);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      manager?: string;
      taxType?: string;
      periodKey?: string;
      data?: FilingCheckSessionData;
    };

    const manager = body.manager ?? '';
    const taxType = body.taxType ?? '';
    const periodKey = body.periodKey ?? '';
    const data = body.data;

    if (!manager || !taxType || !periodKey || !data) {
      return NextResponse.json({ error: 'manager, taxType, periodKey, data required' }, { status: 400 });
    }

    if (!isMasterUser(user) && manager !== user.name) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await upsertFilingCheckSession(manager, taxType, periodKey, data, user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
