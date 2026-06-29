// 거래처 국세청 사업자상태 일괄 조회 (대시보드/목록 일괄 점검)
//   POST { ids?: string[] } | { mine: true }
//     → { configured, results: { [clientId]: { status, statusCode, taxType, closedDate, found, checkedAt } } }
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { getClientBusinessNos, listClients, setClientNtsStatus } from '@/lib/clientsDb';
import { checkStatus, digits10, isNtsConfigured } from '@/lib/nts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const configured = isNtsConfigured();
    if (!configured) {
      return NextResponse.json({ configured: false, results: {} }, NO_STORE);
    }

    const body = (await request.json().catch(() => ({}))) as { ids?: string[]; mine?: boolean };

    // id → 사업자번호(10자리)
    const bizByClient = new Map<string, string>();
    if (body.mine) {
      const rows = await listClients({ mineOnly: true, userId: user.id, userName: user.name || '' });
      for (const r of rows) {
        const b = digits10(r.businessNo || '');
        if (b.length === 10) bizByClient.set(r.id, b);
      }
    } else {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      const map = await getClientBusinessNos(ids);
      for (const [id, biz] of map) {
        const b = digits10(biz);
        if (b.length === 10) bizByClient.set(id, b);
      }
    }

    if (bizByClient.size === 0) {
      return NextResponse.json({ configured: true, results: {} }, NO_STORE);
    }

    const statusMap = await checkStatus([...new Set(bizByClient.values())]);

    const results: Record<string, unknown> = {};
    const checkedAt = new Date().toISOString();
    for (const [id, biz] of bizByClient) {
      const status = statusMap.get(biz);
      if (!status) continue;
      await setClientNtsStatus(id, status);
      results[id] = {
        status: status.status,
        statusCode: status.statusCode,
        taxType: status.taxType,
        closedDate: status.closedDate,
        found: status.found,
        checkedAt,
      };
    }

    return NextResponse.json({ configured: true, results }, NO_STORE);
  } catch (e) {
    return handleApiError(e);
  }
}
