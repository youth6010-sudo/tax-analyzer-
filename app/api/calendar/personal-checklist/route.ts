import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  createPersonalChecklistItem,
  createPersonalChecklistItems,
  HOME_CHECKLIST_LEAD_DAYS,
  listPersonalChecklistForOwner,
  listRoutedRequestsForHome,
} from '@/lib/personalChecklist';
import type { ChecklistTaxType, PersonalChecklistAttachment } from '@/app/types/calendar';
import { expandRepeatDates, type CalendarRepeatInput } from '@/lib/calendarRepeat';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const includeCompleted = url.searchParams.get('includeCompleted') === '1'
      || url.searchParams.get('includeCompleted') === 'true';
    // 홈 할 일 기본: 마감 N일 전부터만 노출 (먼 미래 반복분이 한꺼번에 쌓이지 않게)
    const leadRaw = url.searchParams.get('leadDays');
    const leadDays =
      leadRaw === 'all' || leadRaw === '-1'
        ? undefined
        : leadRaw != null && leadRaw !== ''
          ? Math.max(0, Math.floor(Number(leadRaw)) || HOME_CHECKLIST_LEAD_DAYS)
          : HOME_CHECKLIST_LEAD_DAYS;
    const [items, routed] = await Promise.all([
      listPersonalChecklistForOwner(user.name, { includeCompleted, leadDays }),
      listRoutedRequestsForHome(user.name),
    ]);
    return NextResponse.json({
      items,
      notifications: routed.notifications,
      routedOpen: routed.open,
      routedShared: routed.sharedCompleted,
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
      memo?: string | { body: string; attachments?: PersonalChecklistAttachment[] };
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
