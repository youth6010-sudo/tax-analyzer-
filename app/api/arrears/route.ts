import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { listArrearsEntries } from '@/lib/arrearsDb';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** manager=인디&manager=블루 또는 manager=인디,블루 */
function parseMultiParam(sp: URLSearchParams, key: string): string[] {
  const all = sp.getAll(key).flatMap(v => v.split(',')).map(s => s.trim());
  return [...new Set(all.filter(Boolean))];
}

/** category=recovery,none — none/__none__ 은 미분류('') */
function parseCategoryParams(sp: URLSearchParams): string[] | undefined {
  const raw = sp.getAll('category').flatMap(v => v.split(','));
  if (raw.length === 0) return undefined;
  if (raw.some(v => v.trim() === 'all') && raw.length === 1) return undefined;
  const out: string[] = [];
  for (const v of raw) {
    const t = v.trim();
    if (!t || t === 'all') continue;
    if (t === 'none' || t === '__none__') out.push('');
    else out.push(t);
  }
  return out.length ? [...new Set(out)] : undefined;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sp = new URL(req.url).searchParams;
    const managers = parseMultiParam(sp, 'manager');
    const categories = parseCategoryParams(sp);
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

    const viewerName = user.name?.trim() || '';

    if (!canManage && (!managerNames || managerNames.length === 0)) {
      return NextResponse.json(
        {
          items: [],
          totalsByManager: [],
          totalBalance: 0,
          asOfDate: '',
          canManage: false,
          viewerName,
        },
        NO_STORE,
      );
    }

    const result = await listArrearsEntries({
      managers: managers.length ? managers : undefined,
      categories,
      q,
      nonzero: nonzero || undefined,
      minBalance: Number.isFinite(minBalance) ? minBalance : undefined,
      managerNames,
      ledgerRefOnly: ledgerRefOnly || undefined,
      mismatchOnly: mismatchOnly || undefined,
      ledgerOnly: ledgerOnly || undefined,
      churnedOnly: churnedOnly || undefined,
    });

    return NextResponse.json({ ...result, canManage, viewerName }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
