import LeavePageClient from './LeavePageClient';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LeavePage() {
  await requireUserPage();
  return <LeavePageClient />;
}
