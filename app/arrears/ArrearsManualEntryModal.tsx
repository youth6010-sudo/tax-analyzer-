'use client';

import { useEffect, useMemo, useState } from 'react';
import CenterModal from '@/app/components/portal/CenterModal';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import { formatArrearsWon, type ArrearsEntryDto } from '@/app/types/arrears';
import { todayArrearsPaidYmd } from '@/lib/arrearsLineLabel';
import { fmt } from '@/app/lib/taxAmountFmt';

export type ManualChannel = 'thebill' | 'cms';

type Props = {
  open: boolean;
  channel: ManualChannel;
  /** 목록에서 고를 후보 (상세에서는 1건만 넘겨도 됨) */
  entries: ArrearsEntryDto[];
  /** 미리 선택 */
  initialEntryId?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    entryId: string;
    channel: ManualChannel;
    amount: number;
    eventDate: string;
    description: string;
  }) => Promise<void>;
};

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ArrearsManualEntryModal({
  open,
  channel,
  entries,
  initialEntryId = '',
  busy = false,
  onClose,
  onSubmit,
}: Props) {
  const [entryId, setEntryId] = useState(initialEntryId);
  const [q, setQ] = useState('');
  const [amount, setAmount] = useState('');
  const [eventDate, setEventDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEntryId(initialEntryId);
    setQ('');
    setAmount('');
    setEventDate(todayIso());
    setDescription('');
    setError('');
  }, [open, initialEntryId, channel]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries.slice(0, 80);
    return entries
      .filter(e => {
        const hay = `${e.companyName} ${e.externalCode} ${e.businessNo}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 80);
  }, [entries, q]);

  const selected = entries.find(e => e.id === entryId) || null;
  const title = channel === 'thebill' ? '더빌 입력 (청구)' : 'CMS 입력 (입금)';
  const hint =
    channel === 'thebill'
      ? '더빌에서 확인한 미수·청구를 남깁니다. 잔액이 늘어나고 내역에 사유가 표시됩니다.'
      : 'CMS 출금·입금을 반영합니다. 잔액이 줄고 지급내역에 남습니다.';

  const submit = async () => {
    setError('');
    if (!entryId) {
      setError('거래처를 선택해 주세요.');
      return;
    }
    const n = Number(amount.replace(/,/g, '').trim());
    if (!Number.isFinite(n) || n <= 0) {
      setError('금액은 0보다 커야 합니다.');
      return;
    }
    try {
      await onSubmit({
        entryId,
        channel,
        amount: Math.round(n),
        eventDate,
        description: description.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 실패');
    }
  };

  return (
    <CenterModal open={open} onClose={() => (busy ? undefined : onClose())} title={title}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">{hint}</p>

        {entries.length > 1 || !initialEntryId ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              거래처 찾기
              <input
                type="search"
                className={portalInput}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="상호·코드·사업자번호"
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              거래처
              <select
                className={portalInput}
                value={entryId}
                onChange={e => setEntryId(e.target.value)}
                disabled={busy}
              >
                <option value="">선택…</option>
                {filtered.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.companyName}
                    {e.externalCode ? ` (${e.externalCode})` : ''} · {formatArrearsWon(e.balance)}원
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : selected ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            <span className="font-semibold">{selected.companyName}</span>
            <span className="ml-2 text-xs text-slate-500">
              잔액 {formatArrearsWon(selected.balance)}원
            </span>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            금액
            <input
              type="text"
              inputMode="numeric"
              className={portalInput}
              value={amount}
              onChange={e => setAmount(fmt(e.target.value))}
              placeholder="0"
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            날짜
            <input
              type="date"
              className={portalInput}
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {channel === 'thebill' ? '사유·내역' : '메모(선택)'}
          <input
            type="text"
            className={portalInput}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={
              channel === 'thebill'
                ? '예: 6월 기장료, 추가 컨설팅'
                : '비우면 CMS로 표시 · 오늘 ' + todayArrearsPaidYmd()
            }
            disabled={busy}
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={portalBtnSecondary} disabled={busy} onClick={onClose}>
            취소
          </button>
          <button type="button" className={portalBtnPrimary} disabled={busy} onClick={() => void submit()}>
            {busy ? '반영 중…' : '반영'}
          </button>
        </div>
      </div>
    </CenterModal>
  );
}
