import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { deleteMailReceipt, updateMailReceipt } from '@/lib/mailReceipts';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      clientId?: string;
      receivedAt?: string;
      title?: string;
      tags?: string[];
      memo?: string;
      images?: { id?: string; name?: string; contentType?: string; dataUrl?: string }[];
    };

    const item = await updateMailReceipt(id, {
      clientId: body.clientId,
      receivedAt: body.receivedAt,
      title: body.title,
      tags: body.tags,
      memo: body.memo,
      images: body.images
        ? body.images.map(img => ({
            id: img.id || crypto.randomUUID(),
            name: img.name || 'image',
            contentType: img.contentType || 'image/*',
            dataUrl: img.dataUrl || '',
          }))
        : undefined,
    });
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && (e.message.includes('수임처') || e.message.includes('이미지'))) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handleApiError(e);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const ok = await deleteMailReceipt(id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
