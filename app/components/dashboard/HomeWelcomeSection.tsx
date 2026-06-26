'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ClientRecord } from '@/app/types/client';
import { portalCard, portalEmptyState } from '@/app/components/portal/uiClasses';
import { getClientCategory, SINGO_DAERI } from '@/app/utils/clientsGrouping';
import { getPortalClients, hydratePortal, subscribePortal } from '@/app/utils/portalStore';

export default function HomeWelcomeSection({ userName }: { userName: string }) {
  const [clients, setClients] = useState<ClientRecord[]>(() => getPortalClients());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydratePortal();
    setClients(getPortalClients());
    setReady(true);
    return subscribePortal(() => setClients(getPortalClients()));
  }, []);

  // 법인 / 개인(신고대리 제외) — 신고대리는 합계에서 제외
  const corporate = clients.filter(c => getClientCategory(c) === '법인').length;
  const singo = clients.filter(c => getClientCategory(c) === SINGO_DAERI).length;
  const personal = clients.length - corporate - singo;
  const mainTotal = corporate + personal;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-3xl">
        {userName}님, 안녕하세요 <span aria-hidden>👋</span>
      </h1>
      <p className="mt-2 text-sm text-slate-500 sm:text-base">
        부산지점 수임처 포털 · 담당 수임처 {ready ? `${mainTotal}곳` : '…'}
      </p>
      {ready && mainTotal > 0 && (
        <p className="mt-1.5 portal-meta">
          법인 {corporate} · 개인 {personal}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-x-3 gap-y-2">
        <Link href="/clients" className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline">
          수임처 관리
        </Link>
        <span className="text-slate-300" aria-hidden>·</span>
        <Link href="/clients/intake" className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline">
          유입
        </Link>
        <span className="text-slate-300" aria-hidden>·</span>
        <Link href="/clients/churn" className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline">
          유출
        </Link>
      </div>
      {ready && clients.length === 0 && (
        <div className={`${portalEmptyState} mt-6 ${portalCard} border-solid`}>
          <p className="text-slate-700">담당 active 수임처가 없습니다.</p>
          <Link
            href="/clients/intake?tab=consultation"
            className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:underline"
          >
            신규상담 등록 →
          </Link>
        </div>
      )}
    </div>
  );
}
