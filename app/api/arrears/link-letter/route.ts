import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canUseCharlieFeatures } from '@/lib/masterAccess';
import { linkLetterSheetToEntry } from '@/lib/arrearsMatchReview';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

/** 찰리 전용: 공문 시트 → 미수 행 연결 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canUseCharlieFeatures(user)) {
      return NextResponse.json(
        { error: '공문·원장 연결은 찰리만 할 수 있습니다.' },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      entryId?: string;
      sheetName?: string;
      filename?: string;
      sheet?: {
        companyName?: string;
        letterDate?: string;
        lines?: Array<{
          description?: string;
          amount?: number;
          paidAmount?: number;
          paidDate?: string;
        }>;
      };
    };

    const entryId = String(body.entryId || '').trim();
    if (!entryId) {
      return NextResponse.json({ error: 'entryId 가 필요합니다.' }, { status: 400 });
    }

    const lines = (body.sheet?.lines || [])
      .map(l => ({
        description: String(l.description || '').trim(),
        amount: Math.round(Number(l.amount) || 0),
        paidAmount: Math.round(Number(l.paidAmount) || 0),
        paidDate: String(l.paidDate || '').trim(),
      }))
      .filter(l => l.description || l.amount || l.paidAmount);

    const actorName = user.name?.trim() || '찰리';

    if (lines.length) {
      const result = await linkLetterSheetToEntry({
        entryId,
        actorName,
        sheet: {
          companyName: String(body.sheet?.companyName || body.sheetName || '').trim(),
          letterDate: String(body.sheet?.letterDate || '').trim(),
          lines,
        },
      });
      return NextResponse.json(result, NO_STORE);
    }

    const sheetName = String(body.sheetName || '').trim();
    const filename = String(body.filename || '').trim();
    if (!sheetName || !filename) {
      return NextResponse.json(
        { error: '업로드한 공문 내용(sheet.lines) 또는 sheetName·filename 이 필요합니다.' },
        { status: 400 },
      );
    }

    const result = await linkLetterSheetToEntry({
      entryId,
      sheetName,
      filename,
      actorName,
    });

    return NextResponse.json(result, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
