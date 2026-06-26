import PortalPageShell, { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { requireUser } from '@/lib/auth';
import { isConfigured, loadYouthIds, visibleForUser } from '@/lib/youthIds';
import YouthIdsBoard from './_components/YouthIdsBoard';

export const dynamic = 'force-dynamic';

export default async function YouthIdsPage() {
  const user = await requireUser();
  const categories = visibleForUser(loadYouthIds(), user.name);

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="청년들 ID"
        description={`회사 계좌 · 계정 · 자료 모음 — ${user.name}님 기준 내 계정과 공용 자료만 보입니다.`}
        icon="🔐"
      />
      <YouthIdsBoard categories={categories} me={user.name} configured={isConfigured()} />
    </PortalPageShell>
  );
}
