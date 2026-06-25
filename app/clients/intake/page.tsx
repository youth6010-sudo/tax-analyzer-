import { Suspense } from 'react';
import PortalPageShell from '../../components/portal/PortalPageShell';
import IntakeHub from './IntakeHub';

export default function IntakePage() {
  return (
    <Suspense
      fallback={
        <PortalPageShell>
          <p className="portal-meta">불러오는 중…</p>
        </PortalPageShell>
      }
    >
      <IntakeHub />
    </Suspense>
  );
}
