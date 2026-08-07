import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { parseArrearsFeeEventsWorkbook } from '@/lib/arrearsFeeEventParse';
import { applyFeeEvents, previewFeeEvents } from '@/lib/arrearsLetterDb';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '?¸ê¸ˆê³„ì‚°?œÂ·CMS ê°€?¸ì˜¤ê¸°ëŠ” ?¸ë””Â·ì°°ë¦¬ë§??????ˆìŠµ?ˆë‹¤.' },
        { status: 403 },
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '?‘ì? ?Œì¼??? íƒ??ì£¼ì„¸??' }, { status: 400 });
    }

    const confirm =
      form.get('confirm') === '1' ||
      form.get('confirm') === 'true' ||
      String(form.get('confirm') ?? '').toLowerCase() === 'yes';

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseArrearsFeeEventsWorkbook(buffer, file.name || '');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '?Œì‹± ?¤íŒ¨';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!parsed.events.length) {
      return NextResponse.json({ error: 'ë°˜ì˜???‰ì´ ?†ìŠµ?ˆë‹¤.' }, { status: 400 });
    }

    if (!confirm) {
      const preview = await previewFeeEvents(parsed.events);
      return NextResponse.json(
        {
          preview: true,
          filename: file.name,
          detected: parsed.detected,
          total: parsed.events.length,
          matched: preview.matched,
          unmatched: preview.unmatched,
          sample: preview.rows.slice(0, 40).map(r => ({
            companyName: r.companyName,
            businessNo: r.businessNo,
            kind: r.kind,
            description: r.description,
            amount: r.amount,
            eventDate: r.eventDate,
            isPayment: r.isPayment,
            matched: r.matched,
            matchedCompanyName: r.matchedCompanyName,
          })),
        },
        NO_STORE,
      );
    }

    const result = await applyFeeEvents(
      parsed.events,
      user.name || user.loginId || '',
    );

    return NextResponse.json(
      {
        preview: false,
        filename: file.name,
        detected: parsed.detected,
        total: parsed.events.length,
        ...result,
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
