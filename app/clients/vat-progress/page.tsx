import { Suspense } from 'react';
import PortalPageShell, { PortalLoading } from '@/app/components/portal/PortalPageShell';
import { requireUserPage } from '@/lib/auth';
import VatEntryProgressBoard from '@/app/components/clients/VatEntryProgressBoard';

export default async function VatProgressPage() {
  await requireUserPage();

  return (
    <PortalPageShell className="min-h-0">
      <Suspense fallback={<PortalLoading />}>
        <VatEntryProgressBoard />
      </Suspense>
    </PortalPageShell>
  );
}
