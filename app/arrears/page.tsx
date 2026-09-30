import ArrearsPageClient from './ArrearsPageClient';
import ArrearsHubTabs from './ArrearsHubTabs';
import BondMgmtPanel from './bond/BondMgmtPanel';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ArrearsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUserPage();
  const { tab } = await searchParams;
  if (tab === 'bond') return <BondMgmtPanel />;
  return <ArrearsPageClient tabs={<ArrearsHubTabs active="arrears" />} />;
}
