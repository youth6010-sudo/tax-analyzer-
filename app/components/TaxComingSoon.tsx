interface TaxComingSoonProps {
  title: string;
  description?: string;
}

export default function TaxComingSoon({ title, description }: TaxComingSoonProps) {
  return (
    <main className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-200 flex items-center justify-center text-2xl">
          🚧
        </div>
        <h2 className="text-xl font-black text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-500">
          {description ?? '준비 중입니다. 상단 검색창에서 담당 업체를 찾을 수 있습니다.'}
        </p>
      </div>
    </main>
  );
}
