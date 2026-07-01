'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface BhInfo {
  id?: string;
  name?: string;
  business_number?: string;
  manager?: string;
  branch?: string;
}

interface LinkState {
  blueholeClientId: string;
  linked: boolean;
  configured: boolean;
  info?: BhInfo | null;
  infoError?: string;
  deeplink?: string;
}

const deeplinkOf = (bhId: string) => `https://bluehole.world/client/info/${bhId}`;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function ClientBlueholeCompact({
  clientId,
  companyName,
}: {
  clientId: string;
  companyName?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<LinkState | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '조회 실패');
      setState(data as unknown as LinkState);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = (() => {
    if (loading) return '불러오는 중…';
    if (error) return error;
    if (!state?.linked) {
      if (state && !state.configured) return '블루홀 미설정';
      return '미연결';
    }
    const info = state.info;
    if (info) {
      const parts = [
        info.name || companyName || '—',
        info.business_number,
        info.manager && `담당 ${info.manager}`,
        info.branch && `지점 ${info.branch}`,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    if (state.infoError) return `연결됨 · 정보조회 실패`;
    return `연결됨 (ID ${state.blueholeClientId})`;
  })();

  const href =
    state?.linked && state.blueholeClientId
      ? state.deeplink || deeplinkOf(state.blueholeClientId)
      : null;

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold text-slate-500 shrink-0">블루홀</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 shrink-0"
          >
            열기 ↗
          </a>
        ) : (
          <Link
            href={`/clients/${clientId}`}
            className="text-[10px] font-medium text-slate-400 hover:text-blue-600 shrink-0"
          >
            상세에서 연결
          </Link>
        )}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-700 break-words line-clamp-3" title={summary}>
        {summary}
      </p>
    </div>
  );
}
