import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { createMailReceipt, listMailReceipts } from '@/lib/mailReceipts';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = request.nextUrl;
    const q = searchParams.get('q') ?? '';
    const clientId = searchParams.get('clientId') ?? '';
    const items = await listMailReceipts({ q, clientId });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      clientId?: string;
      receivedAt?: string;
      title?: string;
      tags?: string[];
      memo?: string;
      images?: { id?: string; name?: string; contentType?: string; dataUrl?: string }[];
    };

    const item = await createMailReceipt({
      clientId: body.clientId ?? '',
      receivedAt: body.receivedAt,
      title: body.title,
      tags: body.tags,
      memo: body.memo,
      images: (body.images ?? []).map(img => ({
        id: img.id || crypto.randomUUID(),
        name: img.name || 'image',
        contentType: img.contentType || 'image/*',
        dataUrl: img.dataUrl || '',
      })),
      createdByName: user.name,
    });
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof Error && (e.message.includes('수임처') || e.message.includes('이미지'))) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return handleApiError(e);
  }
}
