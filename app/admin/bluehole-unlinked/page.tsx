import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import BlueholeUnlinkedAdmin from './BlueholeUnlinkedAdmin';

export const dynamic = 'force-dynamic';

export default async function BlueholeUnlinkedPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/');
  }
  return <BlueholeUnlinkedAdmin />;
}
