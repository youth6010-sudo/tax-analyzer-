'use client';

import { useEffect, useState } from 'react';

type InfraChip = {
  badge: string;
  planLabel: string;
  storageConfigured: boolean;
  provider: string;
};

/** 사이드바 — Supabase Seoul Pro 등 체감용 배지 */
export default function InfraStatusChip() {
  const [info, setInfo] = useState<InfraChip | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/infra/status', { credentials: 'same-origin' });
        if (!res.ok) return;
        const data = (await res.json()) as InfraChip;
        if (!cancelled) setInfo(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info?.badge) return null;

  const tip = [
    info.planLabel,
    info.storageConfigured ? 'Storage 연결됨' : 'Storage는 관리자 백업 화면에서 키 연결 가능',
  ].join(' · ');

  return (
    <div className="px-2 pb-1.5" title={tip}>
      <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-2 py-1">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        <p className="min-w-0 truncate text-[10px] font-bold tracking-wide text-emerald-900">
          {info.badge}
        </p>
      </div>
    </div>
  );
}
