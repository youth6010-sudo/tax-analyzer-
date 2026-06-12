import AppHeader from '../components/AppHeader';

export default function TaxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      {children}
    </div>
  );
}
