import Link from 'next/link';
import TaxMenuButton from './TaxMenuButton';
import ContactHeaderSearch from './ContactHeaderSearch';
import AppHeaderUser from './AppHeaderUser';

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <TaxMenuButton />
          <Link
            href="/"
            className="hidden sm:inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
          >
            홈
          </Link>
          <div className="flex-1 min-w-0" aria-hidden="true" />
          <ContactHeaderSearch />
          <AppHeaderUser />
        </div>
      </div>
    </header>
  );
}
