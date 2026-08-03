import ArrearsPageClient from './ArrearsPageClient';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ArrearsPage() {
  await requireUserPage();
  return <ArrearsPageClient />;
}
