import PortalPageShell, { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { requireUserPage } from '@/lib/auth';
import { isConfigured, loadYouthIds } from '@/lib/youthIds';
import YouthIdsBoard from './_components/YouthIdsBoard';

export const dynamic = 'force-dynamic';

export default async function YouthIdsPage() {
  const user = await requireUserPage();
  const doc = loadYouthIds();

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="청년들 ID"
        description={`회사 계좌 · 계정 · 자료 모음 — 기본은 ${user.name}님 계정+공용, '전체보기'로 모두 볼 수 있어요.`}
        icon="🔐"
      />
      <YouthIdsBoard categories={doc.categories} me={user.name} configured={isConfigured()} />
    </PortalPageShell>
  );
}
