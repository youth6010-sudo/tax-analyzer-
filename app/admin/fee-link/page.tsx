import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import FeeLinkAdmin from './FeeLinkAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminFeeLinkPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
  return <FeeLinkAdmin />;
}
