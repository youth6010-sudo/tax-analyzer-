'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardTask } from '@/lib/dashboardTasks';

const TYPE_LABEL: Record<DashboardTask['type'], string> = {
  consultation_draft: '상담 초안',
  onboarding_incomplete: '온보딩',
  bluehole_unlinked: '블루홀',
};

export default function HomeTasksPanel() {
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/tasks')
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(d => setTasks(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (tasks.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
      <h2 className="text-sm font-black text-amber-900">내 할 일</h2>
      <p className="text-[10px] text-amber-800/70 mt-0.5">미완료 상담·온보딩·블루홀 연결</p>
      <ul className="mt-3 space-y-2">
        {tasks.map(t => (
          <li key={t.id}>
            <Link
              href={t.href}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs hover:border-amber-200"
            >
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                {TYPE_LABEL[t.type]}
              </span>
              <span className="font-semibold text-gray-800 flex-1 min-w-[8rem]">{t.title}</span>
              {t.subtitle && <span className="text-gray-500">{t.subtitle}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
