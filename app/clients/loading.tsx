import PortalPageShell from '../components/portal/PortalPageShell';
import { portalCard } from '../components/portal/uiClasses';

export default function ClientsLoading() {
  return (
    <PortalPageShell>
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded-lg" />
        <div className="h-4 w-64 bg-slate-100 rounded" />
        <div className={`${portalCard} h-10 max-w-md bg-slate-50`} />
        <div className={`${portalCard} h-40 bg-slate-50`} />
        <div className={`${portalCard} h-40 bg-slate-50`} />
      </div>
    </PortalPageShell>
  );
}
