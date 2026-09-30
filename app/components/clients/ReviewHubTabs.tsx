'use client';

import PillTabs from '@/app/components/portal/PillTabs';

const TABS = [
  { id: 'annual' as const, label: '연간진행표', href: '/clients/annual-progress' },
  { id: 'vat' as const, label: '부가가치세', href: '/clients/vat-progress' },
  { id: 'review' as const, label: '결산', href: '/clients/review-sheet' },
];

export default function ReviewHubTabs({ active }: { active: 'review' | 'vat' | 'annual' }) {
  return <PillTabs tabs={TABS} active={active} />;
}
