'use client';

import { useCallback, useEffect, useState } from 'react';
import { portalBtnPrimary, portalBtnSecondary, portalCard, portalInput } from '@/app/components/portal/uiClasses';
import { formatArrearsWon } from '@/app/types/arrears';

type ImportConfig = {
  statusAsOfDate: string;
  letterCutoffDate: string;
};

type Props = {
  onApplied?: () => void;
  onClose?: () => void;
};

export default function ArrearsBaselineImport({ onApplied, onClose }: Props) {
  const [config, setConfig] = useState<ImportConfig>({
    statusAsOfDate: '2026.08.31',
    letterCutoffDate: '2026.07.27',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [statusPreview, setStatusPreview] = useState<{
    rowCount: number;
    totalBalance: number;
    asOfDate: string;
  } | null>(null);
  const [detailPreview, setDetailPreview] = useState<{
    companyCount: number;
    txCount: number;
    cutoffDate: string;
  } | null>(null);
  const [pendingStatusFile, setPendingStatusFile] = useState<File | null>(null);
  const [pendingDetailFile, setPendingDetailFile] = useState<File | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/arrears/import-config', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfig({
          statusAsOfDate: (data as ImportConfig).statusAsOfDate || '2026.08.31',
          letterCutoffDate: (data as ImportConfig).letterCutoffDate || '2026.07.27',
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const saveConfig = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/import-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '설정 저장 실패');
      setConfig(data as ImportConfig);
      setMsg('기준일·cutoff 저장됨');
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정 저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const uploadStatus = async (file: File, confirm: boolean) => {
    setBusy(true);
    setError('');
    setMsg('');
    if (!confirm) {
      setStatusPreview(null);
      setPendingStatusFile(null);
    }
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('asOfDate', config.statusAsOfDate);
      if (confirm) form.append('confirm', '1');
      const res = await fetch('/api/arrears/import-status', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '현황표 가져오기 실패');
      if ((data as { preview?: boolean }).preview) {
        setStatusPreview(data as typeof statusPreview & { preview: true });
        setPendingStatusFile(file);
      } else {
        setStatusPreview(null);
        setPendingStatusFile(null);
        setMsg(
          `현황표 반영 · ${(data as { updated?: number }).updated ?? 0}건 갱신 · 총 ${formatArrearsWon((data as { totalBalance?: number }).totalBalance ?? 0)}원`,
        );
        onApplied?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '현황표 가져오기 실패');
    } finally {
      setBusy(false);
    }
  };

  const uploadDetail = async (file: File, confirm: boolean) => {
    setBusy(true);
    setError('');
    setMsg('');
    if (!confirm) {
      setDetailPreview(null);
      setPendingDetailFile(null);
    }
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('cutoffDate', config.letterCutoffDate);
      if (confirm) form.append('confirm', '1');
      const res = await fetch('/api/arrears/import-client-detail', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '상세 가져오기 실패');
      if ((data as { preview?: boolean }).preview) {
        setDetailPreview(data as typeof detailPreview & { preview: true });
        setPendingDetailFile(file);
      } else {
        setDetailPreview(null);
        setPendingDetailFile(null);
        setMsg(
          `거래처별 상세 반영 · ${(data as { applied?: number }).applied ?? 0}社 · 줄 ${(data as { linesAdded?: number }).linesAdded ?? 0}건 추가 (전기이월 덮어쓰기 없음)`,
        );
        onApplied?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '상세 가져오기 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${portalCard} space-y-4 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">미수 기준 파일 가져오기</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            <strong>총 잔액</strong>은 「거래처(잔액)현황」 파일 기준입니다. 상세 내역은{' '}
            <strong>{config.letterCutoffDate} 이전</strong> 공문(letter) 그대로 두고, 이후 변동만
            「거래처별 현황」에서 추가합니다. 전기이월로 공문을 덮어쓰지 않습니다.
          </p>
        </div>
        {onClose ? (
          <button type="button" className={portalBtnSecondary} onClick={onClose}>
            닫기
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          현황표 기준일
          <input
            className={portalInput}
            value={config.statusAsOfDate}
            onChange={e => setConfig(c => ({ ...c, statusAsOfDate: e.target.value }))}
            placeholder="2026.08.31"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          공문 cutoff (이후 → 상세 파일)
          <input
            className={portalInput}
            value={config.letterCutoffDate}
            onChange={e => setConfig(c => ({ ...c, letterCutoffDate: e.target.value }))}
            placeholder="2026.07.27"
            disabled={busy}
          />
        </label>
      </div>
      <button type="button" className={portalBtnSecondary} disabled={busy} onClick={() => void saveConfig()}>
        기준일 저장
      </button>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <p className="text-xs font-semibold text-slate-800">1. 거래처(잔액)현황 — 총미수·업체별 잔액</p>
        <input
          type="file"
          accept=".xls,.xlsx"
          disabled={busy}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void uploadStatus(f, false);
            e.target.value = '';
          }}
        />
        {statusPreview ? (
          <div className="text-xs text-slate-700">
            미리보기 · {statusPreview.rowCount}건 · 총 {formatArrearsWon(statusPreview.totalBalance)}원 ·
            기준 {statusPreview.asOfDate}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={busy || !pendingStatusFile}
                onClick={() => pendingStatusFile && void uploadStatus(pendingStatusFile, true)}
              >
                현황표 반영
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={busy}
                onClick={() => {
                  setStatusPreview(null);
                  setPendingStatusFile(null);
                }}
              >
                취소
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <p className="text-xs font-semibold text-slate-800">
          2. 거래처별 현황 — {config.letterCutoffDate} 이후 내역만 추가
        </p>
        <input
          type="file"
          accept=".xls,.xlsx"
          disabled={busy}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void uploadDetail(f, false);
            e.target.value = '';
          }}
        />
        {detailPreview ? (
          <div className="text-xs text-slate-700">
            미리보기 · {detailPreview.companyCount}社 · 거래 {detailPreview.txCount}건 (cutoff{' '}
            {detailPreview.cutoffDate} 초과)
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={busy || !pendingDetailFile}
                onClick={() => pendingDetailFile && void uploadDetail(pendingDetailFile, true)}
              >
                상세 내역 반영
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={busy}
                onClick={() => {
                  setDetailPreview(null);
                  setPendingDetailFile(null);
                }}
              >
                취소
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {msg ? <p className="text-xs font-semibold text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
