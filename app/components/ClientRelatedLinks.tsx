'use client';

import Link from 'next/link';

type Related = {
  hasInquiry: boolean;
  hasProcess: boolean;
  hasChurn: boolean;
  companyName: string;
};

export default function ClientRelatedLinks({
  clientId: _clientId,
  initial,
}: {
  clientId: string;
  initial?: Related | null;
}) {
  const data = initial;
  if (!data) return null;
  const q = encodeURIComponent(data.companyName);
  const links: { show: boolean; label: string; href: string }[] = [
    { show: data.hasInquiry || data.hasProcess, label: '유입 보기', href: `/clients/intake?q=${q}` },
    { show: data.hasChurn, label: '유출관리', href: '/clients/churn?tab=history' },
  ];
  const active = links.filter(l => l.show);
  if (active.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
      <p className="text-xs font-bold text-gray-500 mb-2">연관 메뉴</p>
      <div className="flex flex-wrap gap-2">
        {active.map(l => (
          <Link key={l.href} href={l.href} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100">
            {l.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
