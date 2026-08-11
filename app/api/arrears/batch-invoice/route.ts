import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildBatchInvoiceRows } from '@/lib/arrearsBatchInvoice';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const ids = (sp.get('ids') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ error: 'ids 가 필요합니다.' }, { status: 400 });
    }
    if (ids.length > 80) {
      return NextResponse.json({ error: '한 번에 80곳까지 선택할 수 있습니다.' }, { status: 400 });
    }

    const rows = await buildBatchInvoiceRows(ids);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return NextResponse.json({ rows, total, count: rows.length }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
