import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getInquiryById, updateInquiry, type InquiryPatch } from '@/lib/consultationDb';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const inquiry = await getInquiryById(id);
    return NextResponse.json({ inquiry });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = (await request.json()) as InquiryPatch;
    const inquiry = await updateInquiry(id, body);
    return NextResponse.json({ inquiry });
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
