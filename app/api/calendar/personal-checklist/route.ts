import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  createPersonalChecklistItem,
  listPersonalChecklistForOwner,
} from '@/lib/personalChecklist';
import type { ChecklistTaxType } from '@/app/types/calendar';

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listPersonalChecklistForOwner(user.name, { includeCompleted: false });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json() as {
      title?: string;
      taxType?: ChecklistTaxType;
      clientId?: string | null;
      dueDate?: string;
      reflectInNotes?: boolean;
      assigneeNames?: string[];
      memo?: string;
    };

    const item = await createPersonalChecklistItem(user.name, {
      title: body.title || '',
      taxType: body.taxType || 'other',
      clientId: body.clientId,
      dueDate: body.dueDate,
      reflectInNotes: body.reflectInNotes,
      assigneeNames: body.assigneeNames,
      memo: body.memo,
    });

    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '저장 실패';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
