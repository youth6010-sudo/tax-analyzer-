import { Suspense } from 'react';
import CalendarPageClient from './CalendarPageClient';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  await requireUser();

  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">불러오는 중…</p>}>
      <CalendarPageClient />
    </Suspense>
  );
}
