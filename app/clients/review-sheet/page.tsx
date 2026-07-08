import { Suspense } from 'react';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import { requireUserPage } from '@/lib/auth';
import ReviewSheetEmbed from './ReviewSheetEmbed';

export default async function ReviewSheetPage() {
  await requireUserPage();

  return (
    <PortalPageShell className="min-h-0">
      <Suspense fallback={null}>
        <ReviewSheetEmbed />
      </Suspense>
    </PortalPageShell>
  );
}
