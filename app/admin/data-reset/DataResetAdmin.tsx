'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalAlertError,
  portalAlertInfo,
  portalAlertWarning,
  portalBtnDangerFill,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalInput,
} from '@/app/components/portal/uiClasses';

type Counts = {
  clients: number;
  clientContacts: number;
  intakeInquiries: number;
  intakeInquiryDrafts: number;
  intakeProcesses: number;
  churnRecords: number;
  clientMeetings: number;
  reportDeliveries: number;
  settlementVisits: number;
  taxFilingChecks: number;
  clientFeeChanges: number;
  clientFeeImportPending: number;
};

const DELETE_ROWS: { key: keyof Counts; label: string }[] = [
  { key: 'clients', label: '수임처(거래처)' },
  { key: 'clientContacts', label: '연락처' },
  { key: 'intakeInquiries', label: '유입관리(초안 제외)' },
  { key: 'intakeProcesses', label: '유입프로세스' },
  { key: 'churnRecords', label: '유출' },
  { key: 'clientMeetings', label: '미팅' },
  { key: 'reportDeliveries', label: '리포트 발송' },
  { key: 'settlementVisits', label: '가결산 방문' },
  { key: 'taxFilingChecks', label: '신고 점검' },
  { key: 'clientFeeChanges', label: '수임료 변경 이력' },
  { key: 'clientFeeImportPending', label: '수임료 미매칭 대기' },
];

const KEEP_ITEMS = [
  '직원 계정·PIN·블루홀 자격증명',
  '앱 설정 / 블루홀 수정 로그',
  '안내문 템플릿',
  '상담 초안',
  '점심·뽑기',
  '청년들 ID',
];

export default function DataResetAdmin() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ total: number; keptDrafts: number } | null>(null);
  const [backedUp, setBackedUp] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/wipe-clients', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '불러오기 실패');
      }
      const data = await res.json();
      setCounts(data.counts);
      setConfirmPhrase(data.confirmPhrase);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadBackup = async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) throw new Error('백업에 실패했습니다.');
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
      setBackedUp(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '백업에 실패했습니다.');
    }
  };

  const totalToDelete = counts
    ? DELETE_ROWS.reduce((sum, r) => sum + (counts[r.key] || 0), 0)
    : 0;

  const canDelete = backedUp && input.trim() === confirmPhrase && !busy && totalToDelete > 0;

  const runWipe = async () => {
    if (!canDelete) return;
    if (!confirm('정말로 수임처 관련 데이터를 전부 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/wipe-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '삭제 실패');
      const total = Object.values(data.deleted as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      setDone({ total, keptDrafts: data.keptInquiryDrafts ?? 0 });
      setInput('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-gray-900">수임처 데이터 초기화</h1>
        <p className="mt-1 text-sm text-gray-500">
          수임처 명단과 유입·유출·연락처·미팅 등 <b>수임처 관련 데이터만</b> 전량 삭제합니다. 새 엑셀 업로드 직전 초기화 용도입니다.
        </p>

        {done && (
          <div className={`${portalAlertInfo} mt-4`}>
            삭제 완료 · 총 {done.total.toLocaleString('ko-KR')}건 제거
            {done.keptDrafts > 0 && ` (상담 초안 ${done.keptDrafts}건 보존)`}
          </div>
        )}
        {error && <div className={`${portalAlertError} mt-4`}>{error}</div>}

        {/* 보존 안내 */}
        <article className={`${portalCard} mt-5 p-5`}>
          <h2 className="text-sm font-bold text-emerald-700">보존되는 데이터 (삭제되지 않음)</h2>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2">
            {KEEP_ITEMS.map(item => (
              <li key={item} className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </article>

        {/* 삭제 대상 */}
        <article className={`${portalCard} mt-4 p-5`}>
          <h2 className="text-sm font-bold text-red-700">삭제되는 데이터</h2>
          {counts ? (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {DELETE_ROWS.map(r => (
                <li key={r.key} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{r.label}</span>
                  <span className="tabular-nums font-semibold text-slate-900">
                    {(counts[r.key] || 0).toLocaleString('ko-KR')}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between py-2">
                <span className="font-bold text-slate-900">합계</span>
                <span className="tabular-nums font-black text-red-700">
                  {totalToDelete.toLocaleString('ko-KR')}
                </span>
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">불러오는 중…</p>
          )}
          {counts && counts.intakeInquiryDrafts > 0 && (
            <p className="mt-2 text-xs text-emerald-600">
              상담 초안 {counts.intakeInquiryDrafts}건은 보존됩니다.
            </p>
          )}
        </article>

        {/* 삭제 절차 */}
        <article className={`${portalCard} mt-4 p-5`}>
          <div className={portalAlertWarning}>
            삭제는 되돌릴 수 없습니다. 반드시 먼저 백업을 내려받은 뒤 진행하세요.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void downloadBackup()} className={portalBtnPrimary}>
              1. JSON 백업 다운로드
            </button>
            {backedUp && <span className="text-xs text-emerald-600">백업 완료 ✓</span>}
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700">
              2. 확인 문구 입력 — <span className="font-mono text-red-700">{confirmPhrase}</span>
            </label>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={confirmPhrase}
              className={`${portalInput} mt-1.5 w-full`}
              disabled={!backedUp}
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runWipe()}
              disabled={!canDelete}
              className={portalBtnDangerFill}
            >
              {busy ? '삭제 중…' : '3. 전체 삭제 실행'}
            </button>
            <button type="button" onClick={() => void load()} className={portalBtnSecondary} disabled={busy}>
              새로고침
            </button>
          </div>
          {!backedUp && (
            <p className="mt-2 text-xs text-slate-400">백업을 먼저 내려받아야 확인 문구 입력이 활성화됩니다.</p>
          )}
        </article>
      </main>
    </div>
  );
}
