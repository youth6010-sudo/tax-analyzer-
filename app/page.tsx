import HomeTopBar from './components/dashboard/HomeTopBar';
import MyClientsBoard from './components/dashboard/MyClientsBoard';
import PortalPageShell from './components/portal/PortalPageShell';
import { portalMain } from './components/portal/uiClasses';
import { requireUserPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await requireUserPage();

  return (
    <PortalPageShell bare>
      <div className="flex-1 bg-gradient-to-b from-sky-50 via-white to-blue-50/40">
        <div className={`${portalMain} w-full py-4`}>
          <HomeTopBar userName={user.name} />
          <MyClientsBoard />
        </div>
      </div>
    </PortalPageShell>
  );
}
