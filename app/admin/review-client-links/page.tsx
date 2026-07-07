import { redirect } from 'next/navigation';
import { requireCharlie } from '@/lib/auth';
import ReviewClientLinksAdmin from './ReviewClientLinksAdmin';

export const dynamic = 'force-dynamic';

export default async function ReviewClientLinksPage() {
  try {
    await requireCharlie();
  } catch {
    redirect('/');
  }
  return <ReviewClientLinksAdmin />;
}
