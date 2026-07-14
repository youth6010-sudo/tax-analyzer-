import { NextResponse } from 'next/server';
import { isPortalAdmin, requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  createCompanyEvent,
  createCompanyEvents,
  deleteCompanyEvent,
  listCompanyEvents,
  updateCompanyEvent,
} from '@/lib/companyEvents';
import { canCreateCompanyEvent } from '@/lib/calendarAccess';
import { currentMonthRange } from '@/lib/calendarMonth';
import {
  checkoffsFromDetails,
  listCheckoffDetailsForEvents,
} from '@/lib/companyEventCheckoffs';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';
import { listTaxDeadlines, taxDeadlinesToCompanyEvents } from '@/lib/taxDeadlineCalendar';
import { listCheckoffDetailsForTaxDeadlines } from '@/lib/taxDeadlineCheckoffs';
import { isDataViewer } from '@/lib/masterAccess';
import { expandRepeatDates, type CalendarRepeatInput } from '@/lib/calendarRepeat';
import type { CheckoffDetail, CompanyEventDto } from '@/app/types/calendar';

function enrichCheckoffs(
  item: CompanyEventDto,
  details: Record<string, CheckoffDetail>,
  team: string[],
  userName: string,
): CompanyEventDto {
  const checkoffs = checkoffsFromDetails(details);
  const checkoffDone = team.filter(name => checkoffs[name]).length;
  return {
    ...item,
    myCheckoff: checkoffs[userName] ?? false,
    checkoffDone,
    checkoffTotal: team.length,
    checkoffs,
    checkoffDetails: details,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const { from, to, year, month } = currentMonthRange();
    const taxLookbackFrom = `${year - 1}-01-01`;

    const [items, team] = await Promise.all([
      listCompanyEvents({ to }),
      listCalendarTeamMembers(),
    ]);
    const taxItems = taxDeadlinesToCompanyEvents(listTaxDeadlines(taxLookbackFrom, to));

    const [companyDetails, taxDetails] = await Promise.all([
      listCheckoffDetailsForEvents(items.map(i => i.id)),
      listCheckoffDetailsForTaxDeadlines(taxItems.map(i => i.id)),
    ]);

    const enrichedManual = items
      .map(item => enrichCheckoffs(item, companyDetails.get(item.id) ?? {}, team, user.name))
      .filter(item => item.startDate >= from || !item.myCheckoff);

    const enrichedTax = taxItems
      .map(item => enrichCheckoffs(item, taxDetails.get(item.id) ?? {}, team, user.name))
      .filter(item => item.startDate >= from || !item.myCheckoff);

    const enriched = [...enrichedManual, ...enrichedTax].sort((a, b) =>
      a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'ko'),
    );

    return NextResponse.json({
      items: enriched,
      team,
      month: { year, month },
      canViewCheckoffDetails: isDataViewer(user),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canCreateCompanyEvent(user)) {
      return NextResponse.json(
        { error: '회사 일정은 결재권자·개발자·관리자만 등록할 수 있습니다.' },
        { status: 403 },
      );
    }
    const body = await req.json() as {
      title?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      scheduleKind?: 'range' | 'deadline';
      allDay?: boolean;
      repeat?: CalendarRepeatInput;
    };

    const base = {
      title: body.title || '',
      description: body.description,
      allDay: body.allDay,
    };

    if (body.repeat) {
      const dates = expandRepeatDates(body.repeat);
      const items = await createCompanyEvents(user.name, base, dates);
      return NextResponse.json({ items, count: items.length });
    }

    const item = await createCompanyEvent(user.name, {
      ...base,
      startDate: body.startDate || '',
      endDate: body.endDate,
      scheduleKind: body.scheduleKind,
    });

    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '저장 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json() as {
      id?: string;
      title?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      scheduleKind?: 'range' | 'deadline';
      allDay?: boolean;
    };

    if (!body.id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    const item = await updateCompanyEvent(
      body.id,
      user.name,
      isPortalAdmin(user),
      body,
    );
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '수정 실패';
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    await deleteCompanyEvent(id, user.name, isPortalAdmin(user));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '삭제 실패';
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
