import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import BlueholeLogsAdmin from './BlueholeLogsAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminBlueholeLogsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
  return <BlueholeLogsAdmin />;
}
