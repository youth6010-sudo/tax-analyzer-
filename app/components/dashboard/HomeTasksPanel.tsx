'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardTask } from '@/lib/dashboardTasks';
import {
  getPortalTasks,
  prefetchPortal,
  subscribePortal,
} from '@/app/utils/portalStore';

const TYPE_LABEL: Record<DashboardTask['type'], string> = {
  consultation_draft: '상담',
  onboarding_incomplete: '프로세스',
};

export default function HomeTasksPanel() {
  const [tasks, setTasks] = useState<DashboardTask[]>(() => getPortalTasks());

  useEffect(() => {
    void prefetchPortal();
    return subscribePortal(() => setTasks(getPortalTasks()));
  }, []);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
      <h2 className="text-sm font-bold text-amber-950">내 할 일</h2>
      <p className="text-xs text-amber-900/80 mt-1">미완료 상담·유입 프로세스</p>
      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-amber-900/70 text-center py-5">할 일 없음</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {tasks.map(t => (
            <li key={t.id}>
              <Link
                href={t.href}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2.5 text-sm hover:border-amber-300 hover:shadow-sm transition-shadow"
              >
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 shrink-0">
                  {TYPE_LABEL[t.type]}
                </span>
                <span className="font-semibold text-gray-800 flex-1 min-w-[8rem] leading-snug">{t.title}</span>
                {t.subtitle && <span className="text-xs text-gray-500">{t.subtitle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
