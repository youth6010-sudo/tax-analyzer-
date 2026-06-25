import PortalPageShell from '../../components/portal/PortalPageShell';
import { portalCard } from '../../components/portal/uiClasses';

export default function ClientDetailLoading() {
  return (
    <PortalPageShell narrow>
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-24 bg-slate-200 rounded" />
        <div className={`${portalCard} overflow-hidden`}>
          <div className="h-24 bg-slate-50" />
          <div className="p-5 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-lg" />
            ))}
          </div>
        </div>
        <div className={`${portalCard} h-40 bg-slate-50`} />
      </div>
    </PortalPageShell>
  );
}
