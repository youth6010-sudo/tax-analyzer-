'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PresenceStaffDto } from '@/lib/presence';

export default function StaffPresencePanel() {
  const [staff, setStaff] = useState<PresenceStaffDto[]>([]);
  const [loaded, setLoaded] = useState(false);

  const applyPayload = useCallback((data: { staff?: PresenceStaffDto[] }) => {
    setStaff(Array.isArray(data.staff) ? data.staff : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollId = 0;
    let cancelled = false;

    const fallbackPoll = () => {
      void (async () => {
        try {
          const res = await fetch('/api/presence', { credentials: 'same-origin' });
          if (!res.ok || cancelled) return;
          const data = (await res.json()) as { staff?: PresenceStaffDto[] };
          applyPayload({ staff: data.staff });
        } catch {
          /* ignore */
        }
      })();
    };

    try {
      es = new EventSource('/api/presence/stream');
      es.onmessage = ev => {
        try {
          const data = JSON.parse(ev.data) as { staff?: PresenceStaffDto[] };
          applyPayload(data);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        fallbackPoll();
        pollId = window.setInterval(() => {
          if (document.visibilityState === 'visible') fallbackPoll();
        }, 12_000);
      };
    } catch {
      fallbackPoll();
      pollId = window.setInterval(() => {
        if (document.visibilityState === 'visible') fallbackPoll();
      }, 12_000);
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollId) window.clearInterval(pollId);
    };
  }, [applyPayload]);

  const onlineCount = staff.filter(s => s.online).length;

  return (
    <section
      className="shrink-0 border-t border-slate-100 px-1 pt-2 pb-1"
      aria-label="직원 접속 상태"
    >
      <div className="flex items-baseline justify-between gap-2 px-2">
        <p className="text-[11px] font-bold tracking-wide text-slate-400">직원</p>
        {loaded ? (
          <p className="text-[10px] font-medium text-slate-400">
            {onlineCount}/{staff.length} 접속
          </p>
        ) : null}
      </div>
      {!loaded ? (
        <p className="px-2 py-1.5 text-[11px] text-slate-400">불러오는 중…</p>
      ) : staff.length === 0 ? (
        <p className="px-2 py-1.5 text-[11px] text-slate-400">계정 없음</p>
      ) : (
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto overscroll-contain">
          {staff.map(s => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-600"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  s.online
                    ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]'
                    : 'bg-slate-300'
                }`}
                title={s.online ? '온라인' : '오프라인'}
                aria-label={s.online ? '온라인' : '오프라인'}
              />
              <span
                className={s.online ? 'font-semibold text-slate-800' : 'font-medium text-slate-500'}
              >
                {s.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
