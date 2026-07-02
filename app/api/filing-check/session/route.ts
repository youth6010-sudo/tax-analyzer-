import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
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
      throw new Error('FORBIDDEN');
    }

    const data = await getFilingCheckSession(manager, taxType, periodKey);
    return NextResponse.json({ data });
  } catch (e) {
    return handleApiError(e);
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
      throw new Error('FORBIDDEN');
    }

    await upsertFilingCheckSession(manager, taxType, periodKey, data, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
