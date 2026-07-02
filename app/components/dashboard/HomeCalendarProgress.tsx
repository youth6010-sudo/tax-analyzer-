'use client';

import { useEffect, useState } from 'react';
import type { DashboardCalendarProgress } from '@/lib/dashboardCalendarProgress';

function MiniProgressBar({
  label,
  done,
  total,
  color,
}: {
  label: string;
  done: number;
  total: number;
  color: 'amber' | 'sky';
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barBg = color === 'amber' ? 'bg-amber-100' : 'bg-sky-100';
  const barFill = color === 'amber' ? 'bg-amber-500' : 'bg-sky-500';
  const textCls = color === 'amber' ? 'text-amber-900' : 'text-sky-900';
  const badgeCls = color === 'amber'
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-sky-100 text-sky-800 border-sky-200';
  const cardCls = color === 'amber'
    ? 'border-amber-200/80 bg-amber-50/60'
    : 'border-sky-200/80 bg-sky-50/60';

  return (
    <div className={`rounded-2xl border px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.03)] ${cardCls}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${badgeCls}`}>
          {label}
        </span>
        <span className={`text-xs font-bold tabular-nums ${textCls}`}>{pct}%</span>
      </div>
      <div className={`mt-2 flex items-center justify-between gap-2 text-xs font-semibold ${textCls}`}>
        <span>진행도</span>
        <span className="tabular-nums">{done}/{total}</span>
      </div>
      <div className={`mt-1.5 h-2.5 w-full overflow-hidden rounded-full ring-1 ring-white/60 ${barBg}`}>
        <div
          className={`h-full rounded-full transition-all ${barFill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function HomeCalendarProgress() {
  const [data, setData] = useState<DashboardCalendarProgress | null>(null);

  useEffect(() => {
    void fetch('/api/dashboard/calendar-progress')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d as DashboardCalendarProgress))
      .catch(() => { /* ignore */ });
  }, []);

  if (!data) return null;

  return (
    <div className="mb-4 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-3 py-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-800">이번 달 일정 진행도</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{data.monthLabel}</span>
      </div>
      <div className="space-y-2">
        <MiniProgressBar
          label="개인 일정"
          done={data.personalCompleted}
          total={data.personalRegistered}
          color="amber"
        />
        <MiniProgressBar
          label="회사 업무"
          done={data.companyCompleted}
          total={data.companyTotal}
          color="sky"
        />
      </div>
    </div>
  );
}
