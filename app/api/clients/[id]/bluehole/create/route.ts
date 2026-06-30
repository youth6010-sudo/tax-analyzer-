// 신규 수임처 → 블루홀 거래처 생성 (Phase 3)
//   POST { force?: boolean }
//     - force 아님: 사업자번호 중복검사 → 일치 거래처 있으면 409 { duplicate, candidates }
//     - 생성 성공: 새 거래처 ID를 수임처에 자동 연결 + 로그
//   주의: 블루홀은 거래처 삭제 API가 없어 생성은 영구적이다.
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, getClientBlueholeId, setClientBlueholeId, setClientNtsStatus } from '@/lib/clientsDb';
import { withBluehole, blueholeConfiguredForUser } from '@/lib/bluehole/server';
import { buildBlueholeCreateValues, BLUEHOLE_CREATE_COLUMNS } from '@/lib/bluehole/clientFieldMap';
import { insertBlueholeSyncLog } from '@/lib/blueholeSyncDb';
import { checkStatus, digits10, isNtsConfigured } from '@/lib/nts';
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

    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
      values?: Record<string, unknown>;
    };
    const force = body.force === true;

    // 서버 기본값(기업구분 corp_type 포함) 위에 사용자가 폼에서 채운 값을 덮어쓴다.
    const base = buildBlueholeCreateValues({
      companyName: client!.companyName,
      businessNo: client!.businessNo,
      corporateNo: client!.corporateNo,
      representative: client!.representative,
      residentNo: client!.residentNo,
      fax: client!.fax,
      businessEntityType: client!.businessEntityType,
    });
    const overrides: Record<string, string> = {};
    if (body.values && typeof body.values === 'object') {
      for (const [k, v] of Object.entries(body.values)) {
        if (BLUEHOLE_CREATE_COLUMNS.has(k) && v != null) overrides[k] = String(v).trim();
      }
    }
    const values: Record<string, string> = { ...base, ...overrides };
    for (const k of Object.keys(values)) if (!values[k].trim()) delete values[k];
    if (!values.name) {
      return NextResponse.json({ error: '거래처명(상호)이 비어 있어 생성할 수 없습니다.' }, { status: 400 });
    }

    // 사업자번호 중복검사 (상호로 검색 후 사업자번호 일치 확인)
    const myBiz = digits(values.business_number || client!.businessNo);
    if (!force && myBiz) {
      const found = (await withBluehole(user.id, (cookie) =>
        bh.searchClients(cookie, values.name),
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

    // 국세청 상태 사전 점검 — 휴/폐업이면 경고(force로 진행 허용). 신규개업 지연 고려해 미등록은 통과.
    if (!force && myBiz.length >= 10 && isNtsConfigured()) {
      try {
        const map = await checkStatus([myBiz]);
        const status = map.get(digits10(myBiz));
        if (status) {
          await setClientNtsStatus(id, status);
          if (status.statusCode === '02' || status.statusCode === '03') {
            return NextResponse.json(
              {
                ntsWarning: true,
                ntsStatus: {
                  status: status.status,
                  statusCode: status.statusCode,
                  taxType: status.taxType,
                  closedDate: status.closedDate,
                },
              },
              { status: 409 },
            );
          }
        }
      } catch {
        // 국세청 조회 실패는 생성 차단 사유가 아니다 — 무시하고 진행
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
