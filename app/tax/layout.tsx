import TaxMenuButton from '../components/TaxMenuButton';
import ContactHeaderSearch from '../components/ContactHeaderSearch';

export default function TaxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 shadow-sm no-print">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <TaxMenuButton />
            <div className="flex-1 min-w-0" aria-hidden="true" />
            <ContactHeaderSearch />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
