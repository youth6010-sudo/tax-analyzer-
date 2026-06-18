import AppHeader from '../components/AppHeader';

export default function GachaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      {children}
    </div>
  );
}
