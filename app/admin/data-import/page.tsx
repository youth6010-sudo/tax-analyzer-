import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import DataImportAdmin from './DataImportAdmin';

export const dynamic = 'force-dynamic';

export default async function DataImportPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
  return <DataImportAdmin />;
}
