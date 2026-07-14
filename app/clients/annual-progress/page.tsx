import { Suspense } from 'react';
import PortalPageShell, { PortalLoading } from '@/app/components/portal/PortalPageShell';
import { requireUserPage } from '@/lib/auth';
import VatAnnualProgressBoard from '@/app/components/clients/VatAnnualProgressBoard';

export default async function VatAnnualProgressPage() {
  await requireUserPage();

  return (
    <PortalPageShell className="min-h-0">
      <Suspense fallback={<PortalLoading />}>
        <VatAnnualProgressBoard />
      </Suspense>
    </PortalPageShell>
  );
}
