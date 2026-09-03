'use client';

import { useCallback, useEffect, useState } from 'react';
import { portalBtnPrimary, portalBtnSecondary, portalCard, portalInput } from '@/app/components/portal/uiClasses';
import { formatArrearsWon } from '@/app/types/arrears';
import { parseArrearsUploadFilename } from '@/lib/arrearsImportFilenames';

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
    skippedIndieHint?: string;
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
      setMsg(`기준일 ${config.statusAsOfDate} 저장 · 목록 조회일이 이 날짜로 바뀝니다`);
      onApplied?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정 저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const uploadStatus = async (file: File, confirm: boolean) => {
    const parsed = parseArrearsUploadFilename(file.name);
    if (!parsed || parsed.kind !== 'status') {
      setError(
        '파일명이 「미수수수료 거래처(잔액)현황_날짜」형식이어야 합니다. 예: 미수수수료 거래처(잔액)현황_26.08.31.xls',
      );
      return;
    }
    // 파일명 날짜 → 기준일 자동 반영
    if (parsed.asOfDate) {
      setConfig(c => ({ ...c, statusAsOfDate: parsed.asOfDate }));
    }

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
      form.append('asOfDate', parsed.asOfDate || config.statusAsOfDate);
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
          `현황표 반영 · ${(data as { updated?: number }).updated ?? 0}건 · 총 ${formatArrearsWon((data as { totalBalance?: number }).totalBalance ?? 0)}원 · 기준 ${(data as { asOfDate?: string }).asOfDate}`,
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
    const parsed = parseArrearsUploadFilename(file.name);
    if (!parsed || parsed.kind !== 'client_detail') {
      setError(
        '파일명이 「거래처별 현황_날짜」형식이어야 합니다. 예: 거래처별 현황_20260902.xlsx',
      );
      return;
    }

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
          `거래처별 현황 반영 · ${(data as { applied?: number }).applied ?? 0}社 · +${(data as { linesAdded?: number }).linesAdded ?? 0}줄 · 인디 스킵 ${(data as { skippedIndie?: number }).skippedIndie ?? 0}`,
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
          <h2 className="text-sm font-bold text-slate-900">기준 파일 업로드 (수정 모드)</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            업로드는 아래 <strong>두 종류만</strong> 가능합니다. 날짜는 파일명에 맞춰 바뀝니다.
            <br />
            · <code className="rounded bg-slate-100 px-1">미수수수료 거래처(잔액)현황_26.08.31.xls</code> →
            목록 잔액·담당·관리
            <br />
            · <code className="rounded bg-slate-100 px-1">거래처별 현황_20260902.xlsx</code> → cutoff 이후
            상세 내역 (인디·하나비·오프라인 제외)
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
          기준일 (목록 조회일)
          <input
            className={portalInput}
            value={config.statusAsOfDate}
            onChange={e => setConfig(c => ({ ...c, statusAsOfDate: e.target.value }))}
            placeholder="2026.08.31"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          공문 cutoff (이후 → 거래처별 현황)
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

      <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-950">
        담당 1인디 · 2블루 · 3다야 · 4윈터 · 5리아 · 6페리. 인디는 현황표 잔액 + 기존 공문 상세.
        하나비·오프라인은 현황표≠공문이면 <strong>불일치</strong> 표시, 상세는 공문 유지.
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <p className="text-xs font-semibold text-slate-800">
          1. 미수수수료 거래처(잔액)현황_[날짜]
        </p>
        <p className="text-[11px] text-slate-500">총미수·업체별 잔액·관리분류(0~4). 파일명 날짜가 기준일이 됩니다.</p>
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
        <p className="text-xs font-semibold text-slate-800">2. 거래처별 현황_[날짜]</p>
        <p className="text-[11px] text-slate-500">
          {config.letterCutoffDate} 이후 변동만 추가. 인디·하나비·오프라인은 반영하지 않습니다.
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
            {detailPreview.skippedIndieHint ? (
              <p className="mt-1 text-[11px] text-slate-500">{detailPreview.skippedIndieHint}</p>
            ) : null}
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
