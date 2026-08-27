import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { getArrearsEntryById } from '@/lib/arrearsDb';
import { appendLetterLine } from '@/lib/arrearsLetterDb';
import { formatArrearsPaidDateKo, todayArrearsPaidDateKo } from '@/app/types/arrears';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/**
 * 더빌(청구) / CMS(입금) 수동 한 줄 반영
 * — 엑셀 import 없이 UI에서만 사용
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageArrears(user)) {
      return NextResponse.json(
        { error: '더빌·CMS 입력은 인디·찰리·리아(관리자)만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      entryId?: string;
      channel?: 'thebill' | 'cms';
      amount?: number;
      eventDate?: string;
      description?: string;
    };

    const entryId = String(body.entryId || '').trim();
    const channel = body.channel;
    const amount = Math.round(Number(body.amount) || 0);
    const rawDesc = String(body.description || '').trim();

    if (!entryId) {
      return NextResponse.json({ error: '거래처(entryId)가 필요합니다.' }, { status: 400 });
    }
    if (channel !== 'thebill' && channel !== 'cms') {
      return NextResponse.json({ error: 'channel은 thebill 또는 cms 여야 합니다.' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: '금액은 0보다 커야 합니다.' }, { status: 400 });
    }

    const existing = await getArrearsEntryById(entryId);
    if (!existing) {
      return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const paidDateLabel =
      formatArrearsPaidDateKo(body.eventDate) || todayArrearsPaidDateKo();
    const actor = user.name || user.loginId || '';

    let description = rawDesc;
    let lineAmount = 0;
    let paidAmount = 0;
    let paidDate = '';
    let source: 'manual' | 'cms' = 'manual';

    if (channel === 'thebill') {
      if (!description) description = '더빌 청구';
      else if (!/^더빌/.test(description)) description = `더빌 · ${description}`;
      lineAmount = amount;
      paidAmount = 0;
      paidDate = '';
      source = 'manual';
    } else {
      if (!description) description = 'CMS';
      else if (!/^CMS/i.test(description)) description = `CMS · ${description}`;
      lineAmount = 0;
      paidAmount = amount;
      paidDate = paidDateLabel;
      source = 'cms';
    }

    try {
      const result = await appendLetterLine(
        entryId,
        actor,
        {
          description,
          amount: lineAmount,
          paidAmount,
          paidDate,
          source,
        },
        { syncBalance: true },
      );
      return NextResponse.json(
        {
          ok: true,
          channel,
          ...result,
          canManage: true,
        },
        NO_STORE,
      );
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') {
        return NextResponse.json({ error: '미수 항목을 찾을 수 없습니다.' }, { status: 404 });
      }
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}
