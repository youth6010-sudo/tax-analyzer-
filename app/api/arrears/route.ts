import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { listArrearsEntries } from '@/lib/arrearsDb';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const manager = sp.get('manager')?.trim() || undefined;
    const categoryParam = sp.get('category');
    const category =
      categoryParam == null || categoryParam === 'all' ? undefined : categoryParam;
    const q = sp.get('q')?.trim() || undefined;
    const nonzero = sp.get('nonzero') === '1' || sp.get('nonzero') === 'true';
    const minBalanceRaw = sp.get('minBalance');
    const minBalance =
      minBalanceRaw != null && minBalanceRaw !== '' ? Number(minBalanceRaw) : undefined;
    const ledgerRefOnly =
      sp.get('ledgerRef') === '1' ||
      sp.get('ledgerRef') === 'true' ||
      sp.get('ledgerRefOnly') === '1';
    const mismatchOnly =
      sp.get('mismatch') === '1' ||
      sp.get('mismatch') === 'true' ||
      sp.get('mismatchOnly') === '1';
    const ledgerOnly =
      sp.get('ledgerOnly') === '1' ||
      sp.get('ledgerOnly') === 'true' ||
      sp.get('ledger_only') === '1';
    const churnedOnly =
      sp.get('churned') === '1' ||
      sp.get('churned') === 'true' ||
      sp.get('churnedOnly') === '1';

    const canManage = canManageArrears(user);
    const managerNames = canManage
      ? undefined
      : getManagerMatchNames(user.name?.trim() || '');

    if (!canManage && (!managerNames || managerNames.length === 0)) {
      return NextResponse.json(
        {
          items: [],
          totalsByManager: [],
          totalBalance: 0,
          asOfDate: '',
          canManage: false,
        },
        NO_STORE,
      );
    }

    const result = await listArrearsEntries({
      manager,
      category,
      q,
      nonzero: nonzero || undefined,
      minBalance: Number.isFinite(minBalance) ? minBalance : undefined,
      managerNames,
      ledgerRefOnly: ledgerRefOnly || undefined,
      mismatchOnly: mismatchOnly || undefined,
      ledgerOnly: ledgerOnly || undefined,
      churnedOnly: churnedOnly || undefined,
    });

    return NextResponse.json({ ...result, canManage }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
