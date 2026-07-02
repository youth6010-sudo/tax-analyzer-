import { NextResponse } from 'next/server';
import { isPortalAdmin, requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import {
  createCompanyEvent,
  deleteCompanyEvent,
  listUpcomingCompanyEvents,
  updateCompanyEvent,
} from '@/lib/companyEvents';

export async function GET() {
  try {
    await requireUser();
    const items = await listUpcomingCompanyEvents(30);
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
      description?: string;
      startDate?: string;
      endDate?: string;
      scheduleKind?: 'range' | 'deadline';
      allDay?: boolean;
    };

    const item = await createCompanyEvent(user.name, {
      title: body.title || '',
      description: body.description,
      startDate: body.startDate || '',
      endDate: body.endDate,
      scheduleKind: body.scheduleKind,
      allDay: body.allDay,
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
