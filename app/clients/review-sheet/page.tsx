import PortalPageShell from '@/app/components/portal/PortalPageShell';
import { requireUserPage } from '@/lib/auth';
import ReviewSheetEmbed from './ReviewSheetEmbed';

export default async function ReviewSheetPage() {
  await requireUserPage();

  return (
    <PortalPageShell bare className="min-h-0">
      <ReviewSheetEmbed />
    </PortalPageShell>
  );
}
