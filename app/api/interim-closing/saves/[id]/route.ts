import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { deleteInterimClosingSave, getInterimClosingSave } from '@/lib/interimClosingDb';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const saved = await getInterimClosingSave(id);
    if (!saved) {
      return NextResponse.json({ error: '없음' }, { status: 404 });
    }
    return NextResponse.json({ saved });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const ok = await deleteInterimClosingSave(id);
    if (!ok) {
      return NextResponse.json({ error: '없음' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
