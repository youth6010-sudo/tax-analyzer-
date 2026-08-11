'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';

type Infra = {
  badge?: string;
  planLabel?: string;
  regionLabel?: string;
  storageConfigured?: boolean;
  projectRef?: string | null;
};

export default function BackupAdmin() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [withMailImages, setWithMailImages] = useState(false);
  const [infra, setInfra] = useState<Infra | null>(null);
  const [storageMsg, setStorageMsg] = useState<string | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/infra/status', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setInfra(d))
      .catch(() => setInfra(null));
  }, []);

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

  const ensureStorage = async () => {
    setStorageBusy(true);
    setStorageMsg(null);
    try {
      const res = await fetch('/api/admin/storage/ensure', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Storage 준비 실패');
      setStorageMsg(data.message || (data.ok ? '준비됨' : '실패'));
      if (data.infra) setInfra(data.infra);
      else if (typeof data.storageConfigured === 'boolean') {
        setInfra(prev => ({ ...(prev || {}), storageConfigured: data.storageConfigured }));
      }
    } catch (e) {
      setStorageMsg(e instanceof Error ? e.message : 'Storage 준비 실패');
    } finally {
      setStorageBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-gray-900">데이터 백업 · Pro</h1>
        <p className="mt-1 text-sm text-gray-500">
          public 스키마 JSON 보조 백업과 Supabase Pro(서울) 백업·Storage 안내입니다.
        </p>

        <article className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-emerald-950">0) 지금 연결 — {infra?.badge || '확인 중…'}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-emerald-950/85">
            <li>
              플랜 안내: <b>{infra?.planLabel || '—'}</b> · 리전 {infra?.regionLabel || '—'}
            </li>
            <li>
              Storage:{' '}
              {infra?.storageConfigured ? (
                <span className="font-semibold text-emerald-800">연결됨</span>
              ) : (
                <span className="font-semibold text-amber-800">미연결</span>
              )}
            </li>
            <li>
              Pro 콘솔에서 <b>Database → Backups / PITR</b> 을 켜 두면 시점 복구가 가능합니다.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-emerald-900/70 leading-relaxed">
            Storage를 쓰려면 Vercel·로컬에{' '}
            <code className="rounded bg-white/80 px-1">SUPABASE_URL</code> (없으면 DB에서
            추론)과 <code className="rounded bg-white/80 px-1">SUPABASE_SERVICE_ROLE_KEY</code> 를
            넣고 재배포한 뒤 아래 버튼을 누르세요.
          </p>
          <button
            type="button"
            onClick={() => void ensureStorage()}
            disabled={storageBusy}
            className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {storageBusy ? '준비 중…' : '우편물 Storage 버킷 준비'}
          </button>
          {storageMsg ? <p className="mt-2 text-xs text-emerald-900">{storageMsg}</p> : null}
        </article>

        <article className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/50 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-amber-950">위험 작업 전 체크</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-amber-950/85">
            <li>JSON 또는 pg_dump 백업을 NAS에 받기</li>
            <li>미수·원장·공문 import는 미리보기에서 건수 확인 후 확정</li>
            <li>확정 직후 이상하면 Supabase PITR·백업으로 되돌리기 (콘솔)</li>
          </ol>
        </article>

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
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </article>

        <article className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-blue-900">2) 권장 — pg_dump (본백업)</h2>
          <p className="mt-2 text-xs text-blue-900/80 leading-relaxed">
            사무실 PC에서 PostgreSQL 클라이언트가 있으면 전체 DB를 바이너리로 덤프합니다. 파일은
            NAS·OneDrive 등 <b>앱 밖</b>에 보관하세요.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-white/80 px-3 py-2 text-[11px] text-slate-700 ring-1 ring-blue-100">
{`npm run db:backup:dump
npm run db:backup
npm run db:backup -- --with-mail-images`}
          </pre>
        </article>

        <article className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-emerald-900">3) Supabase Pro 콘솔 백업</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-emerald-900/85">
            <li>프로젝트 → Database → Backups / PITR (Pro에서 강화)</li>
            <li>알림: 용량·장애 메일 켜 두기</li>
            <li>
              대시보드:{' '}
              <a
                className="underline"
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                supabase.com/dashboard
              </a>
            </li>
          </ul>
        </article>
      </main>
    </div>
  );
}
