import AppHeader from '../../components/AppHeader';

export default function ClientDetailLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 space-y-4 animate-pulse">
        <div className="h-6 w-24 bg-gray-200 rounded" />
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <div className="h-32 bg-blue-50/80" />
          <div className="p-5 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-50 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="h-40 bg-gray-100 rounded-2xl" />
      </main>
    </div>
  );
}
