import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import DataResetAdmin from './DataResetAdmin';

export const dynamic = 'force-dynamic';

export default async function DataResetPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
  return <DataResetAdmin />;
}
