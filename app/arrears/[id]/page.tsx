import ArrearsLetterClient from './ArrearsLetterClient';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ArrearsLetterPage({ params }: Props) {
  await requireUserPage();
  const { id } = await params;
  return <ArrearsLetterClient id={id} />;
}
