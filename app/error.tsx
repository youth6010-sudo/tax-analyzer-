'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-sm text-center">
          <h1 className="text-lg font-bold text-slate-900">오류가 발생했습니다</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error.message || 'Internal Server Error'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              다시 시도
            </button>
            <a
              href="/"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              홈으로
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
