'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { type BusinessEntityType } from '@/app/types/contact';
import {
  getPortalHomeStats,
  hydratePortal,
  subscribePortal,
} from '@/app/utils/portalStore';

const ENTITY_GROUPS: { id: BusinessEntityType; label: string }[] = [
  { id: 'corporate', label: '법인' },
  { id: 'individual', label: '개인' },
  { id: 'nonBusiness', label: '비사업자' },
];

export default function HomeWelcomeSection({ userName }: { userName: string }) {
  const [stats, setStats] = useState(() => getPortalHomeStats());

  useEffect(() => {
    if (!stats) hydratePortal();
    return subscribePortal(() => setStats(getPortalHomeStats()));
  }, [stats]);

  const breakdown = stats
    ? ENTITY_GROUPS.map(g => {
        const n = g.id === 'corporate' ? stats.corporate
          : g.id === 'individual' ? stats.individual
            : stats.nonBusiness;
        return n > 0 ? `${g.label} ${n}` : null;
      }).filter(Boolean).join(' · ')
    : '';

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
        {userName}님, 안녕하세요
      </h1>
      <p className="mt-2 text-sm text-gray-700">
        부산지점 수임처 포털 · 담당 수임처 {stats != null ? `${stats.count}곳` : '…'}
      </p>
      {stats && stats.count > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          {breakdown}
          {stats.unclassified > 0 && (
            <>
              {breakdown ? ' · ' : ''}
              미분류 {stats.unclassified}
            </>
          )}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/clients" className="text-sm font-semibold text-blue-600 hover:underline">
          수임처 관리
        </Link>
        <span className="text-gray-300">·</span>
        <Link href="/clients/intake" className="text-sm font-semibold text-blue-600 hover:underline">
          유입
        </Link>
      </div>
      {stats?.count === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">담당 active 수임처가 없습니다.</p>
          <Link
            href="/clients/intake?tab=consultation"
            className="mt-3 inline-flex text-sm font-bold text-blue-600 hover:underline"
          >
            신규상담 등록 →
          </Link>
        </div>
      )}
    </div>
  );
}
