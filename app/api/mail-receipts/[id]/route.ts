import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { deleteMailReceipt, updateMailReceipt } from '@/lib/mailReceipts';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      clientId?: string;
      receivedAt?: string;
      title?: string;
      images?: { id?: string; name?: string; contentType?: string; dataUrl?: string }[];
      addTag?: string;
      deleteTag?: string;
      addMemo?: string;
      updateMemo?: { id: string; body: string };
      deleteMemo?: string;
    };

    const item = await updateMailReceipt(id, user.name, {
      clientId: body.clientId,
      receivedAt: body.receivedAt,
      title: body.title,
      addTag: body.addTag,
      deleteTag: body.deleteTag,
      addMemo: body.addMemo,
      updateMemo: body.updateMemo,
      deleteMemo: body.deleteMemo,
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
    if (
      e instanceof Error
      && (e.message.includes('수임처')
        || e.message.includes('이미지')
        || e.message.includes('본인')
        || e.message.includes('태그')
        || e.message.includes('메모'))
    ) {
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
    const user = await requireUser();
    const { id } = await params;
    const ok = await deleteMailReceipt(id, user.name);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes('본인')) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return handleApiError(e);
  }
}
