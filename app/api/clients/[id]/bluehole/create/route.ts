// 신규 수임처 → 블루홀 거래처 생성 (Phase 3)
//   POST { force?: boolean }
//     - force 아님: 사업자번호 중복검사 → 일치 거래처 있으면 409 { duplicate, candidates }
//     - 생성 성공: 새 거래처 ID를 수임처에 자동 연결 + 로그
//   주의: 블루홀은 거래처 삭제 API가 없어 생성은 영구적이다.
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, getClientBlueholeId, setClientBlueholeId } from '@/lib/clientsDb';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { buildBlueholeCreateValues } from '@/lib/bluehole/clientFieldMap';
import { insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import * as bh from '@/lib/bluehole/core.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };
const digits = (s: string) => (s || '').replace(/\D/g, '');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);

    if (!(await blueholeConfiguredForUser(user.id))) {
      return NextResponse.json(
        { error: '블루홀 계정이 등록되어 있지 않습니다.', code: 'no_account' },
        { status: 400 },
      );
    }

    const already = (await getClientBlueholeId(id)) || '';
    if (already) {
      return NextResponse.json(
        { error: '이미 블루홀 거래처와 연결되어 있습니다.', blueholeClientId: already },
        { status: 409 },
      );
    }

    const values = buildBlueholeCreateValues({
      companyName: client!.companyName,
      businessNo: client!.businessNo,
      corporateNo: client!.corporateNo,
      representative: client!.representative,
      residentNo: client!.residentNo,
      fax: client!.fax,
      businessEntityType: client!.businessEntityType,
    });
    if (!values.name) {
      return NextResponse.json({ error: '거래처명(상호)이 비어 있어 생성할 수 없습니다.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force === true;

    // 사업자번호 중복검사 (상호로 검색 후 사업자번호 일치 확인)
    const myBiz = digits(client!.businessNo);
    if (!force && myBiz) {
      const found = (await withBluehole(user.id, (cookie) =>
        bh.searchClients(cookie, client!.companyName),
      )) as { id: string; name: string; business_number?: string }[];
      const dups = (found || []).filter((c) => digits(c.business_number || '') === myBiz);
      if (dups.length > 0) {
        return NextResponse.json(
          {
            duplicate: true,
            candidates: dups.map((c) => ({ id: c.id, name: c.name, business_number: c.business_number || '' })),
          },
          { status: 409 },
        );
      }
    }

    const created = (await withBluehole(user.id, (cookie) => bh.createClient(cookie, values))) as {
      newId?: string;
      clientUrl?: string;
    };
    const newId = created.newId || '';
    if (!newId) {
      return NextResponse.json({ error: '블루홀 거래처 생성에 실패했습니다(새 ID 미수신).' }, { status: 500 });
    }

    await setClientBlueholeId(id, newId);
    await insertBlueholeSyncLog({
      clientId: id,
      blueholeClientId: newId,
      action: 'create',
      userId: user.id,
      userName: user.name || '',
      changes: values,
      successCols: Object.keys(values),
      warnings: ['신규 거래처 생성'],
    });

    return NextResponse.json(
      { blueholeClientId: newId, deeplink: `https://bluehole.world/client/info/${newId}` },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
