import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import BackupAdmin from './BackupAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminBackupPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
  return <BackupAdmin />;
}
