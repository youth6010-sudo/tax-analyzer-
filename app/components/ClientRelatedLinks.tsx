'use client';

import Link from 'next/link';
import type { PersonalChecklistDto } from '@/app/types/calendar';
import type { ChecklistTaxType } from '@/app/types/calendar';
import { getChecklistTypeLabel } from '@/app/types/calendar';

type Related = {
  hasInquiry: boolean;
  hasProcess: boolean;
  hasChurn: boolean;
  companyName: string;
};

function taxLabel(taxType: ChecklistTaxType): string {
  return getChecklistTypeLabel(taxType);
}

export default function ClientRelatedLinks({
  clientId: _clientId,
  initial,
  checklistItems = [],
}: {
  clientId: string;
  initial?: Related | null;
  checklistItems?: PersonalChecklistDto[];
}) {
  const data = initial;
  const q = data ? encodeURIComponent(data.companyName) : '';

  const menuLinks: { show: boolean; label: string; href: string }[] = data
    ? [
        { show: data.hasInquiry || data.hasProcess, label: '유입 보기', href: `/clients/intake?q=${q}` },
        { show: data.hasChurn, label: '유출관리', href: '/clients/churn?tab=history' },
      ]
  : [];

  const activeMenu = menuLinks.filter(l => l.show);
  const hasChecklist = checklistItems.length > 0;

  if (activeMenu.length === 0 && !hasChecklist) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
      <p className="text-xs font-bold text-gray-500 mb-2">연관 업무</p>
      <div className="flex flex-col gap-2">
        {activeMenu.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeMenu.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                {l.label} →
              </Link>
            ))}
          </div>
        )}
        {hasChecklist && (
          <ul className="space-y-1.5 border-t border-gray-100 pt-2">
            {checklistItems.map(item => (
              <li key={item.id}>
                <Link
                  href={`/calendar?highlight=${item.id}`}
                  className="flex items-center gap-2 text-xs rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900 hover:bg-amber-100"
                >
                  <span className="font-bold shrink-0">
                    {taxLabel(item.taxType)}
                  </span>
                  <span className="truncate">{item.title}</span>
                  {item.reflectInNotes && (
                    <span className="text-[10px] text-blue-600 shrink-0">특이사항</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
