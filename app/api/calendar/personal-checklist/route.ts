import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  createPersonalChecklistItem,
  createPersonalChecklistItems,
  listPersonalChecklistForOwner,
  listRoutedRequestsForHome,
} from '@/lib/personalChecklist';
import type { ChecklistTaxType } from '@/app/types/calendar';
import { expandRepeatDates, type CalendarRepeatInput } from '@/lib/calendarRepeat';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const includeCompleted = url.searchParams.get('includeCompleted') === '1'
      || url.searchParams.get('includeCompleted') === 'true';
    const [items, routed] = await Promise.all([
      listPersonalChecklistForOwner(user.name, { includeCompleted }),
      listRoutedRequestsForHome(user.name),
    ]);
    return NextResponse.json({
      items,
      notifications: [],
      routedOpen: routed.open,
      routedShared: [],
    });
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
      repeat?: CalendarRepeatInput;
    };

    const base = {
      title: body.title || '',
      taxType: body.taxType || 'other',
      clientId: body.clientId,
      reflectInNotes: body.reflectInNotes,
      assigneeNames: body.assigneeNames,
      memo: body.memo,
    };

    if (body.repeat) {
      const dates = expandRepeatDates(body.repeat);
      const items = await createPersonalChecklistItems(user.name, { ...base, dueDate: dates[0] }, dates);
      return NextResponse.json({ items, count: items.length });
    }

    const item = await createPersonalChecklistItem(user.name, {
      ...base,
      dueDate: body.dueDate,
    });

    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '저장 실패';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
