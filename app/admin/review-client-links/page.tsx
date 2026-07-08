import { redirect } from 'next/navigation';
import { requireReviewLinkAdmin } from '@/lib/auth';
import ReviewClientLinksAdmin from './ReviewClientLinksAdmin';

export const dynamic = 'force-dynamic';

export default async function ReviewClientLinksPage() {
  try {
    await requireReviewLinkAdmin();
  } catch {
    redirect('/');
  }
  return <ReviewClientLinksAdmin />;
}