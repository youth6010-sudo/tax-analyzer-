import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  createInterimClosingSave,
  listInterimClosingSaves,
} from '@/lib/interimClosingDb';
import type { InterimClosingPayload } from '@/lib/interimClosingTypes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId') || undefined;
    const companyName = url.searchParams.get('companyName') || undefined;
    const yearRaw = url.searchParams.get('year');
    const year = yearRaw ? Number(yearRaw) : undefined;
    const items = await listInterimClosingSaves({
      clientId,
      companyName,
      year: Number.isFinite(year) ? year : undefined,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      clientId?: string | null;
      companyName?: string;
      year?: number;
      baseMonth?: number;
      manager?: string;
      payload?: InterimClosingPayload;
    };
    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json({ error: 'payload 필요' }, { status: 400 });
    }
    const year = Number(body.year ?? body.payload.year);
    const baseMonth = Number(body.baseMonth ?? body.payload.baseMonth ?? 6);
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: 'year 필요' }, { status: 400 });
    }
    const saved = await createInterimClosingSave({
      clientId: body.clientId ?? null,
      companyName: String(body.companyName || body.payload.companyName || ''),
      year,
      baseMonth: Number.isFinite(baseMonth) ? baseMonth : 6,
      manager: String(body.manager || user.name || ''),
      payload: {
        ...body.payload,
        year,
        baseMonth: Number.isFinite(baseMonth) ? baseMonth : 6,
        companyName: String(body.companyName || body.payload.companyName || ''),
      },
      savedBy: user.name || user.loginId || '',
      savedByUserId: user.id,
    });
    return NextResponse.json({ saved });
  } catch (e) {
    return handleApiError(e);
  }
}
