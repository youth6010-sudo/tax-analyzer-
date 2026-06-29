// 거래처 국세청 진위확인 (사업자번호 + 개업일자 + 대표자 일치 여부)
//   POST { startDt, representative? } → { configured, valid, validCode, message, status? }
//   startDt(개업일자)는 intakeData.openDate에 정규화 저장.
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, updateClientDetail } from '@/lib/clientsDb';
import { digits10, isNtsConfigured, validateBusinesses } from '@/lib/nts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);

    const configured = isNtsConfigured();
    if (!configured) {
      return NextResponse.json({ configured: false }, NO_STORE);
    }

    const body = (await request.json().catch(() => ({}))) as { startDt?: string; representative?: string };
    const businessNo = digits10((client as { businessNo?: string }).businessNo || '');
    const startDt = String(body.startDt || '').replace(/\D/g, '').slice(0, 8);
    const intakeData = (client as { intakeData?: Record<string, unknown> }).intakeData ?? {};
    const representative =
      (body.representative || (client as { representative?: string }).representative || '').trim();

    if (businessNo.length !== 10) {
      return NextResponse.json({ configured: true, error: '유효한 사업자등록번호가 없습니다.' }, { status: 400 });
    }
    if (startDt.length !== 8) {
      return NextResponse.json(
        { configured: true, error: '개업일자(YYYYMMDD 8자리)를 입력하세요.' },
        { status: 400 },
      );
    }

    const map = await validateBusinesses([{ bNo: businessNo, startDt, representative }]);
    const result = map.get(businessNo);
    if (!result) {
      return NextResponse.json({ configured: true, error: '진위확인 결과가 없습니다.' }, NO_STORE);
    }

    // 입력한 개업일자를 intakeData.openDate에 보관(다음 진위확인 프리필)
    if (String(intakeData.openDate || '') !== startDt) {
      await updateClientDetail(id, { intakeData: { openDate: startDt } });
    }

    return NextResponse.json(
      {
        configured: true,
        valid: result.valid,
        validCode: result.validCode,
        message: result.message,
        status: result.status
          ? {
              status: result.status.status,
              statusCode: result.status.statusCode,
              taxType: result.status.taxType,
              closedDate: result.status.closedDate,
            }
          : undefined,
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
