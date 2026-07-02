'use client';

import { useState } from 'react';
import type { CompanyScheduleKind } from '@/app/types/calendar';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';

type Props = {
  onCreated?: () => void;
  onCancel?: () => void;
  defaultDate?: string;
  inModal?: boolean;
};

export default function CompanyEventAddForm({ onCreated, onCancel, defaultDate, inModal }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleKind, setScheduleKind] = useState<CompanyScheduleKind>('range');
  const [startDate, setStartDate] = useState(defaultDate || '');
  const [endDate, setEndDate] = useState(defaultDate || '');
  const [dueDate, setDueDate] = useState(defaultDate || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload =
        scheduleKind === 'deadline'
          ? { title, description, scheduleKind, startDate: dueDate, endDate: dueDate }
          : { title, description, scheduleKind, startDate, endDate: endDate || startDate };

      const res = await fetch('/api/calendar/company-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      setTitle('');
      setDescription('');
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    title.trim() &&
    (scheduleKind === 'deadline' ? dueDate : startDate);

  const wrapperCls = inModal ? 'space-y-3' : 'rounded-lg border border-sky-200 bg-white p-3 space-y-2';

  return (
    <div className={wrapperCls}>
      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setScheduleKind('range')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            scheduleKind === 'range' ? 'bg-sky-100 text-sky-900' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          범위
        </button>
        <button
          type="button"
          onClick={() => setScheduleKind('deadline')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            scheduleKind === 'deadline' ? 'bg-sky-100 text-sky-900' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          기한
        </button>
      </div>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="일정 제목"
        className={portalInput + ' w-full text-xs py-1.5'}
      />

      {scheduleKind === 'range' ? (
        <>
          <input
            type="date"
            value={startDate}
            onChange={e => {
              setStartDate(e.target.value);
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
            }}
            className={portalInput + ' w-full text-xs py-1.5'}
            aria-label="시작일"
          />
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={e => setEndDate(e.target.value)}
            className={portalInput + ' w-full text-xs py-1.5'}
            aria-label="종료일"
          />
        </>
      ) : (
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className={portalInput + ' w-full text-xs py-1.5'}
          aria-label="기한"
        />
      )}

      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="설명 (선택)"
        className={portalInput + ' w-full text-xs py-1.5'}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !canSubmit}
          className={portalBtnPrimary + ' flex-1 text-xs py-1.5'}
        >
          {saving ? '저장 중…' : '추가'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={portalBtnSecondary + ' text-xs py-1.5'}>
            취소
          </button>
        )}
      </div>
    </div>
  );
}
