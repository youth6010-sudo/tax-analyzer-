// 국세청 사업자상태 정기 자동 점검 (Vercel Cron)
//   vercel.json 의 crons 스케줄에 따라 주기적으로 호출된다.
//   전체 활성 수임처의 사업자등록 상태를 조회해 nts_* 캐시에 저장 →
//   대시보드/목록의 폐업·휴업 배지가 버튼 없이도 항상 최신으로 유지된다.
//
// 인증: Vercel Cron 은 CRON_SECRET 이 설정돼 있으면
//   Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 붙여 호출한다.
import { NextRequest, NextResponse } from 'next/server';
import { listActiveClientBusinessNos, setClientNtsStatus } from '@/lib/clientsDb';
import { checkStatus, digits10, isNtsConfigured } from '@/lib/nts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  // 시크릿 미설정 시(예: 개발 환경) 게이트를 열어둔다.
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!isNtsConfigured()) {
    console.error('[cron/nts-refresh] NTS_SERVICE_KEY 미설정 — 건너뜀');
    return NextResponse.json({ ok: false, reason: 'NTS_NOT_CONFIGURED' }, { status: 200 });
  }

  const startedAt = Date.now();
  try {
    const clients = await listActiveClientBusinessNos();
    if (clients.length === 0) {
      return NextResponse.json({ ok: true, scanned: 0, updated: 0, closed: 0 });
    }

    const uniqueBizNos = [...new Set(clients.map(c => digits10(c.businessNo)))];
    const statusMap = await checkStatus(uniqueBizNos);

    let updated = 0;
    let closed = 0;
    const closedClients: Array<{ id: string; statusCode: string }> = [];

    // 원거리 DB 부하를 줄이기 위해 20건씩 병렬 저장
    const BATCH = 20;
    for (let i = 0; i < clients.length; i += BATCH) {
      const slice = clients.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async c => {
          const status = statusMap.get(digits10(c.businessNo));
          if (!status) return;
          await setClientNtsStatus(c.id, status);
          updated += 1;
          if (status.statusCode === '02' || status.statusCode === '03') {
            closed += 1;
            closedClients.push({ id: c.id, statusCode: status.statusCode });
          }
        }),
      );
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[cron/nts-refresh] 완료 — scanned=${clients.length} updated=${updated} closed=${closed} (${elapsedMs}ms)`,
    );
    if (closedClients.length > 0) {
      console.log('[cron/nts-refresh] 휴/폐업 감지:', JSON.stringify(closedClients));
    }

    return NextResponse.json({
      ok: true,
      scanned: clients.length,
      updated,
      closed,
      elapsedMs,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[cron/nts-refresh] 실패:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
