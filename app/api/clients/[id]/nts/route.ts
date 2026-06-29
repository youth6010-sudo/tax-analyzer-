// 거래처 국세청 사업자상태 조회
//   GET → { configured, businessNo, nts: { status, statusCode, taxType, closedDate, checkedAt } | null, error? }
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, setClientNtsStatus } from '@/lib/clientsDb';
import { checkStatus, digits10, isNtsConfigured } from '@/lib/nts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client);

    const businessNo = digits10((client as { businessNo?: string }).businessNo || '');
    const configured = isNtsConfigured();

    if (!configured) {
      return NextResponse.json({ configured: false, businessNo, nts: null }, NO_STORE);
    }
    if (businessNo.length !== 10) {
      return NextResponse.json(
        { configured: true, businessNo, nts: null, error: '유효한 사업자등록번호가 없습니다.' },
        NO_STORE,
      );
    }

    const map = await checkStatus([businessNo]);
    const status = map.get(businessNo);
    if (!status) {
      return NextResponse.json(
        { configured: true, businessNo, nts: null, error: '국세청 조회 결과가 없습니다.' },
        NO_STORE,
      );
    }

    await setClientNtsStatus(id, status);
    return NextResponse.json(
      {
        configured: true,
        businessNo,
        nts: {
          status: status.status,
          statusCode: status.statusCode,
          taxType: status.taxType,
          closedDate: status.closedDate,
          found: status.found,
          checkedAt: new Date().toISOString(),
        },
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
