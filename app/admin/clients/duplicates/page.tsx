import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import DuplicateClientsAdmin from './DuplicateClientsAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminDuplicatesPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
  return <DuplicateClientsAdmin />;
}
