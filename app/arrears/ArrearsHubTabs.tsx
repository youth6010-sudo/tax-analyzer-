'use client';

import PillTabs from '@/app/components/portal/PillTabs';

const TABS = [
  { id: 'arrears' as const, label: '미수관리', href: '/arrears' },
  { id: 'bond' as const, label: '채권관리', href: '/arrears?tab=bond' },
];

export type ArrearsHubTab = (typeof TABS)[number]['id'];

export default function ArrearsHubTabs({ active }: { active: ArrearsHubTab }) {
  return <PillTabs tabs={TABS} active={active} />;
}
