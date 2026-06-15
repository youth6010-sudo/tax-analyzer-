import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listFilingChecksForManager } from '@/lib/taxFilingDb';
import { getActiveFilingPeriods, defaultFilingSelection } from '@/lib/taxFilingSchedule';
import type { TaxTypeId } from '@/app/config/taxTypes';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const taxType = (url.searchParams.get('taxType') ?? defaultFilingSelection().taxType) as TaxTypeId;
    const periodKey = url.searchParams.get('periodKey') ?? defaultFilingSelection().periodKey;

    const checks = await listFilingChecksForManager(user.name, taxType, periodKey);
    const periods = getActiveFilingPeriods();

    return NextResponse.json({ checks, periods, taxType, periodKey });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
