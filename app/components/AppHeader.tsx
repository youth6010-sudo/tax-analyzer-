import TaxMenuButton from './TaxMenuButton';
import ContactHeaderSearch from './ContactHeaderSearch';
import AppHeaderUser from './AppHeaderUser';

export default function AppHeader({ sticky = true }: { sticky?: boolean }) {
  return (
    <header
      className={[
        sticky ? 'sticky top-0 z-50' : 'relative z-50',
        'bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm shadow-slate-200/40 no-print',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <TaxMenuButton />
        <div className="flex min-w-0 flex-1 justify-center px-2 sm:px-6">
          <ContactHeaderSearch expanded />
        </div>
        <AppHeaderUser />
      </div>
    </header>
  );
}
