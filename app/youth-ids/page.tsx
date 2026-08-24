import Link from 'next/link';
import { headers } from 'next/headers';
import PortalPageShell, { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { requireUserPage } from '@/lib/auth';
import { assertYouthIdsIpAllowed } from '@/lib/youthIdsAccess';
import { isYouthIdsConfiguredAsync, loadYouthIdsAsync } from '@/lib/youthIdsDb';
import { listCalendarTeamMembers } from '@/lib/calendarTeam';
import YouthIdsBoard from './_components/YouthIdsBoard';

export const dynamic = 'force-dynamic';

export default async function YouthIdsPage() {
  const user = await requireUserPage();
  const hdrs = await headers();
  if (!assertYouthIdsIpAllowed(hdrs)) {
    return (
      <PortalPageShell>
        <PortalPageHeader title="청년들 ID" description="접근이 제한되었습니다." icon="🔐" />
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <h2 className="text-base font-bold text-slate-900">회사 네트워크에서만 이용할 수 있습니다</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            청년들 ID는 사무실 공인 IP에서만 열립니다. 회사망에 연결된 뒤 다시 시도해 주세요.
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-blue-700 hover:underline">
            대시보드로 돌아가기
          </Link>
        </div>
      </PortalPageShell>
    );
  }
  const doc = await loadYouthIdsAsync();
  const configured = await isYouthIdsConfiguredAsync();
  const staffNames = await listCalendarTeamMembers();

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="청년들 ID"
        description={`회사 계좌 · 계정 · 자료 모음 — 기본은 ${user.name}님 계정+공용, '전체보기'로 모두 볼 수 있어요. 편집으로 항목 추가·수정 가능.`}
        icon="🔐"
      />
      <YouthIdsBoard
        categories={doc.categories}
        me={user.name}
        configured={configured}
        staffNames={staffNames}
      />
    </PortalPageShell>
  );
}
