'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalBtnSecondary,
  portalCard,
  portalAlertError,
} from '@/app/components/portal/uiClasses';
import { actionLabel, actionBadge, columnLabel } from '@/app/components/clients/blueholeLogLabels';

interface LogEntry {
  id: string;
  at: string;
  action: string;
  clientId: string;
  blueholeClientId: string;
  companyName: string;
  userName: string;
  changes: Record<string, string>;
  successCols: string[];
  warnings: string[];
}

const PAGE_SIZE = 100;

export default function BlueholeLogsAdmin() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/bluehole/logs?limit=${PAGE_SIZE}&offset=${nextOffset}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '로그를 불러오지 못했습니다.');
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setOffset(nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <Link href="/clients" className="text-sm text-blue-600 hover:underline">
            ← 수임처 관리
          </Link>
          <h1 className="text-xl font-bold text-slate-900 mt-2">블루홀 변경 감사 로그</h1>
          <p className="text-sm text-slate-500 mt-1">
            블루홀 거래처 연결·해제·수정·생성 이력 전체 (최신순).
          </p>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button type="button" onClick={() => void load(offset)} className={portalBtnSecondary}>
            새로고침
          </button>
          <span className="text-sm text-slate-500">총 {total.toLocaleString('ko-KR')}건</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              className={`${portalBtnSecondary} disabled:opacity-40`}
            >
              이전
            </button>
            <span className="text-sm text-slate-500 tabular-nums">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => void load(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total || loading}
              className={`${portalBtnSecondary} disabled:opacity-40`}
            >
              다음
            </button>
          </div>
        </div>

        {error && <div className={`${portalAlertError} mb-4`}>{error}</div>}

        <div className={`${portalCard} overflow-hidden`}>
          {loading ? (
            <p className="p-6 text-sm text-slate-500 text-center">불러오는 중…</p>
          ) : entries.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 text-center">변경 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">시각</th>
                    <th className="px-4 py-2.5 font-medium">작업</th>
                    <th className="px-4 py-2.5 font-medium">수임처</th>
                    <th className="px-4 py-2.5 font-medium">사용자</th>
                    <th className="px-4 py-2.5 font-medium">변경 항목</th>
                    <th className="px-4 py-2.5 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((e) => {
                    const cols = (e.successCols.length ? e.successCols : Object.keys(e.changes))
                      .map(columnLabel)
                      .join(', ');
                    return (
                      <tr key={e.id} className="align-top hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 tabular-nums">
                          {new Date(e.at).toLocaleString('ko-KR')}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${actionBadge(e.action)}`}
                          >
                            {actionLabel(e.action)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/clients/${e.clientId}`}
                            className="font-medium text-slate-800 hover:text-blue-700 hover:underline"
                          >
                            {e.companyName || '(삭제된 수임처)'}
                          </Link>
                          {e.blueholeClientId && (
                            <a
                              href={`https://bluehole.world/client/info/${e.blueholeClientId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-xs text-blue-600 hover:underline"
                            >
                              ↗
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{e.userName || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{cols || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-amber-700">
                          {e.warnings.length > 0 ? e.warnings.join(' / ') : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
