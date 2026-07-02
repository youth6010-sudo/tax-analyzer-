import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  deletePersonalChecklistItem,
  getPersonalChecklistById,
  updatePersonalChecklistItem,
} from '@/lib/personalChecklist';
import type { ChecklistCategory, ChecklistTaxType } from '@/app/types/calendar';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const item = await getPersonalChecklistById(id);
    if (!item || item.ownerName !== user.name) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json() as {
      title?: string;
      category?: ChecklistCategory;
      taxType?: ChecklistTaxType | '';
      clientId?: string | null;
      dueDate?: string;
      completed?: boolean;
      reflectInNotes?: boolean;
    };

    const item = await updatePersonalChecklistItem(id, user.name, body);
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '수정 실패';
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deletePersonalChecklistItem(id, user.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '삭제 실패';
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
