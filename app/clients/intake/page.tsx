import { Suspense } from 'react';
import IntakeHub from './IntakeHub';

export default function IntakePage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-400">불러오는 중…</p>}>
      <IntakeHub />
    </Suspense>
  );
}
