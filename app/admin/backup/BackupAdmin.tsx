'use client';

import Link from 'next/link';
import { useState } from 'react';
import AppHeader from '@/app/components/AppHeader';

export default function BackupAdmin() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [withMailImages, setWithMailImages] = useState(false);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const q = withMailImages ? '?withMailImages=1' : '';
      const res = await fetch(`/api/admin/backup${q}`);
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
          public 스키마 전체 테이블을 JSON으로 내려받습니다. PIN·블루홀 비밀번호는 포함되지 않습니다.
        </p>

        <article className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800">1) 웹 JSON 백업 (보조)</h2>
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">
            대량 삭제·초기화 <b>직전</b>이나 빠른 스냅샷용입니다. 우편물 사진은 기본 제외(용량·타임아웃).
            일상 본백업은 아래 2·3번을 쓰세요.
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={withMailImages}
              onChange={e => setWithMailImages(e.target.checked)}
            />
            우편물 이미지(base64) 포함 — 파일이 매우 커질 수 있음
          </label>
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

        <article className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-blue-900">2) 권장 — pg_dump (본백업)</h2>
          <p className="mt-2 text-xs text-blue-900/80 leading-relaxed">
            사무실 PC에서 PostgreSQL 클라이언트가 있으면 전체 DB를 바이너리로 덤프합니다.
            파일은 NAS·OneDrive 등 <b>앱 밖</b>에 보관하세요.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-white/80 px-3 py-2 text-[11px] text-slate-700 ring-1 ring-blue-100">
{`npm run db:backup:dump
npm run db:backup          # JSON (전체 테이블)
npm run db:backup -- --with-mail-images`}
          </pre>
        </article>

        <article className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-emerald-900">3) Supabase 콘솔 백업</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-emerald-900/85">
            <li>Supabase 프로젝트 → Database → Backups / PITR 확인</li>
            <li>Free는 자동 백업이 약할 수 있음 → 여유 되면 Pro + 일일 백업 권장</li>
            <li>용량·비활성 pause 알림을 켜 두세요</li>
          </ul>
        </article>

        <article className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-amber-950">권장 일정</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-950/85">
            <li><b>매주 1회</b>: <code className="rounded bg-white/70 px-1">npm run db:backup:dump</code> 또는 Supabase 스냅샷 → NAS/클라우드</li>
            <li><b>대량 수정·초기화 직전</b>: 웹 JSON 또는 CLI JSON 한 번 더</li>
            <li><b>매월 1회</b>: 백업 파일이 열리는지·용량이 이상한지 점검</li>
          </ul>
          <p className="mt-3 text-[11px] text-amber-900/70">
            웹 JSON에는 복원 UI가 없습니다. 복구는 pg_restore / Supabase 지원·스테이징 DB에서 검증 후 진행하세요.
          </p>
        </article>
      </main>
    </div>
  );
}
