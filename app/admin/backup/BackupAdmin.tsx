'use client';

import Link from 'next/link';
import { useState } from 'react';
import AppHeader from '@/app/components/AppHeader';

export default function BackupAdmin() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '백업에 실패했습니다.');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `tax-analyzer-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setLastAt(new Date().toLocaleString('ko-KR'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '백업에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 홈</Link>
        <h1 className="mt-2 text-xl font-black text-gray-900">데이터 백업</h1>
        <p className="mt-1 text-sm text-gray-500">
          수임처·유입·유출·사용자 등 DB 전체를 JSON 파일로 내려받습니다. PIN 해시는 포함되지 않습니다.
        </p>

        <article className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800">전체 백업</h2>
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">
            Neon Postgres에 저장된 주요 테이블을 한 번에 export합니다.
            정기적으로 내려받아 두시면 데이터 복구·이전 시 참고할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="mt-4 w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading ? '백업 생성 중…' : 'JSON 백업 다운로드'}
          </button>
          {lastAt && (
            <p className="mt-3 text-xs text-green-700">마지막 다운로드: {lastAt}</p>
          )}
          {error && (
            <p className="mt-3 text-sm text-red-700">{error}</p>
          )}
        </article>

        <p className="mt-6 text-[11px] text-gray-400">
          복원 기능은 아직 제공되지 않습니다. Neon 콘솔의 자동 백업·PITR도 함께 활용해 주세요.
        </p>
      </main>
    </div>
  );
}
