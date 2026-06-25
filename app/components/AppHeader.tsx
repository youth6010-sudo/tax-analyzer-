import TaxMenuButton from './TaxMenuButton';
import ContactHeaderSearch from './ContactHeaderSearch';
import AppHeaderUser from './AppHeaderUser';
import PortalPrefetch from './PortalPrefetch';

export default function AppHeader({ sticky = true }: { sticky?: boolean }) {
  return (
    <header
      className={[
        sticky ? 'sticky top-0 z-40' : 'relative z-10',
        'bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm shadow-slate-200/40 no-print',
      ].join(' ')}
    >
      <PortalPrefetch />
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          <TaxMenuButton />
          <div className="flex-1 min-w-0" aria-hidden="true" />
          <ContactHeaderSearch />
          <AppHeaderUser />
        </div>
      </div>
    </header>
  );
}
