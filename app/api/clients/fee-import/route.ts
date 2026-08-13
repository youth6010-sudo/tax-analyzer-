import { NextResponse } from 'next/server';

import { canEditClient, isDataViewer } from '@/lib/clientAccess';
import { listClients, updateClientFeeItems } from '@/lib/clientsDb';
import { parseFeeInvoiceWorkbook, type FeeInvoiceImportPreview } from '@/lib/feeInvoiceImport';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { computeFeeSummaryFromItems } from '@/app/utils/feeBreakdown';
import { clientBizNoKey } from '@/app/utils/clientBizNo';
import type { ClientRecord } from '@/app/types/client';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!isDataViewer(user)) {
      return NextResponse.json({ error: '세금계산서 엑셀 업로드 권한이 없습니다.' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '엑셀 파일을 선택해 주세요.' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const invoiceByBiz = parseFeeInvoiceWorkbook(buffer, file.name || '');
    const allClients = (await listClients({ includeChurned: false })) as ClientRecord[];

    const clientsByBiz = new Map<string, ClientRecord[]>();
    for (const c of allClients) {
      const biz = clientBizNoKey(c);
      if (!biz) continue;
      const list = clientsByBiz.get(biz) ?? [];
      list.push(c);
      clientsByBiz.set(biz, list);
    }

    const matched: FeeInvoiceImportPreview['matched'] = [];
    const unmatchedBizNos: string[] = [];
    let skippedNoPermission = 0;
    let updated = 0;

    for (const [biz, feeItems] of invoiceByBiz) {
      const candidates = clientsByBiz.get(biz) ?? [];
      if (!candidates.length) {
        unmatchedBizNos.push(biz);
        continue;
      }
      const client =
        candidates.length === 1 ? candidates[0] : (candidates.find(c => c.status === 'active') ?? candidates[0]);
      const feeSummary = computeFeeSummaryFromItems(feeItems);

      if (!canEditClient(user, client)) {
        skippedNoPermission += 1;
        continue;
      }

      await updateClientFeeItems(client.id, feeItems, user.id, { resetHistory: true });
      updated += 1;
      matched.push({
        clientId: client.id,
        companyName: client.companyName,
        businessNo: client.businessNo ?? biz,
        manager: client.manager ?? null,
        feeItems,
        feeSummary,
      });
    }

    unmatchedBizNos.sort();

    return NextResponse.json(
      {
        updated,
        matched,
        unmatchedBizNos,
        skippedNoPermission,
        invoiceBizCount: invoiceByBiz.size,
      },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
