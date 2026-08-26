import { Suspense } from 'react';
import ArrearsLetterClient from './ArrearsLetterClient';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ArrearsLetterPage({ params }: Props) {
  await requireUserPage();
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">불러오는 중…</div>}>
      <ArrearsLetterClient id={id} />
    </Suspense>
  );
}
