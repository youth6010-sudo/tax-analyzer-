'use client';

import { useEffect, useState } from 'react';
import type { DashboardCalendarProgress } from '@/lib/dashboardCalendarProgress';

function ProgressRow({
  label,
  done,
  total,
  accent,
}: {
  label: string;
  done: number;
  total: number;
  accent: 'blue' | 'teal';
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = accent === 'blue' ? 'bg-[#4b6cb7]' : 'bg-teal-500';
  const track = accent === 'blue' ? 'bg-blue-100' : 'bg-teal-100';

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <span className="text-xs font-bold tabular-nums text-slate-500">
          {done}/{total} · {pct}%
        </span>
      </div>
      <div className={`mt-2 h-2 overflow-hidden rounded-full ${track}`}>
        <div className={`h-full rounded-full transition-all ${fill}`} style={{ width: `${pct}%` }} />
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
    <div className="mb-3 shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#4b6cb7]/10 text-[#4b6cb7]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
          </span>
          <span className="text-sm font-bold text-slate-800">이번 달 일정 진행도</span>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
          {data.monthLabel}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <ProgressRow
          label="개인 일정"
          done={data.personalCompleted}
          total={data.personalRegistered}
          accent="blue"
        />
        <ProgressRow
          label="회사 업무"
          done={data.companyCompleted}
          total={data.companyTotal}
          accent="teal"
        />
      </div>
    </div>
  );
}
