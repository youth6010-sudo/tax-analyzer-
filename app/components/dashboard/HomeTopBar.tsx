'use client';

import { useEffect, useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import { getClientCategory, SINGO_DAERI } from '@/app/utils/clientsGrouping';
import { getPortalClients, hydratePortal, subscribePortal } from '@/app/utils/portalStore';
import TaxFilterBar from './TaxFilterBar';

export default function HomeTopBar({ userName }: { userName: string }) {
  const [clients, setClients] = useState<ClientRecord[]>(() => getPortalClients());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydratePortal();
    setClients(getPortalClients());
    setReady(true);
    return subscribePortal(() => setClients(getPortalClients()));
  }, []);

  const corporate = clients.filter(c => getClientCategory(c) === '법인').length;
  const personal = clients.filter(c => {
    const cat = getClientCategory(c);
    return cat !== '법인' && cat !== SINGO_DAERI && cat !== '지주택';
  }).length;
  const mainTotal = corporate + personal;

  return (
    <header className="mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-blue-100 pb-3 [scrollbar-width:thin]">
      <p className="shrink-0 whitespace-nowrap text-base font-bold text-slate-800">
        {userName}님, 안녕하세요 <span aria-hidden>👋</span>
      </p>

      <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden />

      <p className="shrink-0 whitespace-nowrap text-xs text-slate-500">
        부산지점 수임처 포털 · 담당 수임처 {ready ? `${mainTotal}곳` : '…'}
      </p>

      {ready && mainTotal > 0 && (
        <>
          <span className="shrink-0 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-sky-700">
            법인 {corporate}
          </span>
          <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700">
            개인 {personal}
          </span>
        </>
      )}

      <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden />

      <TaxFilterBar compact />
    </header>
  );
}
