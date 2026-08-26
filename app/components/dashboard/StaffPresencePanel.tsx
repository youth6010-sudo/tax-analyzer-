'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PresenceStaffDto } from '@/lib/presence';
import { managerNamesMatch } from '@/app/utils/managerMatch';

export default function StaffPresencePanel() {
  const [staff, setStaff] = useState<PresenceStaffDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selfName, setSelfName] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const applyPayload = useCallback((data: { staff?: PresenceStaffDto[] }) => {
    setStaff(Array.isArray(data.staff) ? data.staff : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.name) setSelfName(String(data.user.name).trim());
      })
      .catch(() => {});
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

  const canEdit = useCallback(
    (name: string) => {
      if (!selfName) return false;
      return managerNamesMatch(selfName, name);
    },
    [selfName],
  );

  const toggleAccept = useCallback(
    async (s: PresenceStaffDto, kind: 'individual' | 'corporate') => {
      if (!canEdit(s.name) || savingId) return;
      const nextIndividual = kind === 'individual' ? !s.acceptIndividual : s.acceptIndividual;
      const nextCorporate = kind === 'corporate' ? !s.acceptCorporate : s.acceptCorporate;

      setStaff(prev =>
        prev.map(row =>
          row.id === s.id
            ? { ...row, acceptIndividual: nextIndividual, acceptCorporate: nextCorporate }
            : row,
        ),
      );
      setSavingId(s.id);
      try {
        const res = await fetch('/api/auth/me/accept-clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            individual: nextIndividual,
            corporate: nextCorporate,
          }),
        });
        if (!res.ok) {
          const poll = await fetch('/api/presence', { credentials: 'same-origin' });
          if (poll.ok) {
            const data = (await poll.json()) as { staff?: PresenceStaffDto[] };
            applyPayload({ staff: data.staff });
          }
        }
      } catch {
        /* ignore */
      } finally {
        setSavingId(null);
      }
    },
    [canEdit, savingId, applyPayload],
  );

  const onlineCount = staff.filter(s => s.online).length;

  return (
    <section
      className="shrink-0 border-t border-slate-100 px-1 pt-2 pb-1"
      aria-label="직원 접속 상태"
    >
      <div className="flex items-baseline justify-between gap-2 px-2">
        <p className="text-[11px] font-bold tracking-wide text-slate-400">직원 · 수임가능</p>
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
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto overscroll-contain">
          {staff.map(s => {
            const editable = canEdit(s.name);
            return (
              <li
                key={s.id}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-600"
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
                  className={`min-w-0 truncate ${
                    s.online ? 'font-semibold text-slate-800' : 'font-medium text-slate-500'
                  }`}
                >
                  {s.name}
                </span>
                <span className="ml-auto flex shrink-0 gap-0.5">
                  <AcceptMini
                    label="개"
                    title="개인"
                    on={!!s.acceptIndividual}
                    editable={editable}
                    disabled={savingId === s.id}
                    onClick={() => void toggleAccept(s, 'individual')}
                  />
                  <AcceptMini
                    label="법"
                    title="법인"
                    on={!!s.acceptCorporate}
                    editable={editable}
                    disabled={savingId === s.id}
                    onClick={() => void toggleAccept(s, 'corporate')}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AcceptMini({
  label,
  title,
  on,
  editable,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  on: boolean;
  editable: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const cls = on
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-slate-50 text-slate-400 border-slate-200';
  if (!editable) {
    return (
      <span
        className={`rounded border px-1 py-px text-[9px] font-bold ${cls}`}
        title={`${title} 수임가능 ${on ? 'ON' : 'OFF'}`}
      >
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      title={`클릭: ${title} 수임가능 ${on ? 'OFF' : 'ON'}`}
      onClick={onClick}
      className={`rounded border px-1 py-px text-[9px] font-bold hover:ring-1 hover:ring-blue-300 disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  );
}
