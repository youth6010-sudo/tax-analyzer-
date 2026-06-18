import AppHeader from '../components/AppHeader';

export default function ClientsLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6 lg:py-8 animate-pulse">
        <div className="h-8 w-40 bg-gray-200 rounded-lg mb-2" />
        <div className="h-4 w-64 bg-gray-100 rounded mb-6" />
        <div className="h-10 max-w-md bg-gray-100 rounded-xl mb-6" />
        <div className="space-y-4">
          <div className="h-48 bg-gray-100 rounded-xl" />
          <div className="h-48 bg-gray-100 rounded-xl" />
        </div>
      </main>
    </div>
  );
}
