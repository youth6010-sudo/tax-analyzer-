'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CompanyEventDto, CompanyScheduleKind } from '@/app/types/calendar';
import { formatCalendarCreatedAt } from '@/app/types/calendar';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import {
  WEEKDAY_OPTIONS,
  INTERVAL_OPTIONS,
  previewRepeatCount,
  type RepeatMode,
  type RepeatIntervalKind,
} from '@/lib/calendarRepeat';

type Props = {
  onCreated?: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
  onCancel?: () => void;
  defaultDate?: string;
  editItem?: CompanyEventDto | null;
  inModal?: boolean;
};

export default function CompanyEventAddForm({
  onCreated,
  onUpdated,
  onDeleted,
  onCancel,
  defaultDate,
  editItem = null,
  inModal,
}: Props) {
  const isEdit = Boolean(editItem);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(defaultDate || '');
  const [repeatOn, setRepeatOn] = useState(false);
  const [repeatFrom, setRepeatFrom] = useState(defaultDate || '');
  const [repeatTo, setRepeatTo] = useState('');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('weekdays');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [interval, setIntervalKind] = useState<RepeatIntervalKind>('weekly');
  const [everyDays, setEveryDays] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title);
      setDescription(editItem.description || '');
      setDueDate(editItem.startDate);
      setRepeatOn(false);
      return;
    }
    setTitle('');
    setDescription('');
    setDueDate(defaultDate || '');
    setRepeatFrom(defaultDate || '');
    setRepeatTo('');
    setRepeatOn(false);
    setRepeatMode('weekdays');
    setWeekdays([1, 2, 3, 4, 5]);
    setIntervalKind('weekly');
    setEveryDays(3);
  }, [editItem, defaultDate]);

  const previewCount = useMemo(
    () =>
      repeatOn
        ? previewRepeatCount({
            from: repeatFrom,
            to: repeatTo,
            mode: repeatMode,
            weekdays,
            interval,
            everyDays,
          })
        : null,
    [repeatOn, repeatFrom, repeatTo, repeatMode, weekdays, interval, everyDays],
  );

  const toggleWeekday = (id: number) => {
    setWeekdays(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id].sort((a, b) => a - b),
    );
  };

  const submit = async () => {
    if (!isEdit && repeatOn) {
      if (!repeatFrom || !repeatTo) {
        alert('반복 기간(시작·종료)을 입력하세요.');
        return;
      }
      if (repeatMode === 'weekdays' && weekdays.length === 0) {
        alert('반복할 요일을 선택하세요.');
        return;
      }
      if (repeatMode === 'interval' && interval === 'custom' && (!everyDays || everyDays < 1)) {
        alert('반복 주기(일)를 입력하세요.');
        return;
      }
    } else if (!dueDate) {
      alert('마감기한을 입력하세요.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (isEdit && editItem) {
        const payload = {
          id: editItem.id,
          title,
          description,
          scheduleKind: 'deadline' as CompanyScheduleKind,
          startDate: dueDate,
          endDate: dueDate,
        };
        const res = await fetch('/api/calendar/company-events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
        onUpdated?.();
      } else {
        const payload =
          repeatOn
            ? {
                title,
                description,
                repeat: {
                  from: repeatFrom,
                  to: repeatTo,
                  mode: repeatMode,
                  weekdays: repeatMode === 'weekdays' ? weekdays : undefined,
                  interval: repeatMode === 'interval' ? interval : undefined,
                  everyDays: repeatMode === 'interval' && interval === 'custom' ? everyDays : undefined,
                },
              }
            : {
                title,
                description,
                scheduleKind: 'deadline' as CompanyScheduleKind,
                startDate: dueDate,
                endDate: dueDate,
              };
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editItem) return;
    if (!confirm(`"${editItem.title}" 일정을 삭제할까요?`)) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(
        `/api/calendar/company-events?id=${encodeURIComponent(editItem.id)}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '삭제 실패');
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const wrapperCls = inModal ? 'space-y-3' : 'rounded-lg border border-sky-200 bg-white p-3 space-y-2';

  return (
    <div className={wrapperCls}>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="일정 제목"
        className={portalInput + ' w-full text-xs py-1.5'}
      />

      {!isEdit && (
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={repeatOn}
            onChange={e => setRepeatOn(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          기간 · 반복 등록
        </label>
      )}

      {!isEdit && repeatOn ? (
        <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">시작일</label>
              <input
                type="date"
                value={repeatFrom}
                onChange={e => setRepeatFrom(e.target.value)}
                className={portalInput + ' w-full text-xs py-1.5'}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">종료일</label>
              <input
                type="date"
                value={repeatTo}
                onChange={e => setRepeatTo(e.target.value)}
                className={portalInput + ' w-full text-xs py-1.5'}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <input
                type="radio"
                name="company-repeat-mode"
                checked={repeatMode === 'weekdays'}
                onChange={() => setRepeatMode('weekdays')}
              />
              반복 요일
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <input
                type="radio"
                name="company-repeat-mode"
                checked={repeatMode === 'interval'}
                onChange={() => setRepeatMode('interval')}
              />
              반복 주기
            </label>
          </div>

          {repeatMode === 'weekdays' ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-slate-600">요일 선택</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_OPTIONS.map(d => {
                  const on = weekdays.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleWeekday(d.id)}
                      className={`h-7 w-7 rounded-full text-[11px] font-bold ring-1 ${
                        on
                          ? 'bg-[#1e3a8a] text-white ring-[#1e3a8a]'
                          : 'bg-white text-slate-500 ring-slate-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-600">주기 선택</p>
              <div className="flex flex-wrap gap-1.5">
                {INTERVAL_OPTIONS.map(opt => {
                  const on = interval === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIntervalKind(opt.id)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold ring-1 ${
                        on
                          ? 'bg-[#1e3a8a] text-white ring-[#1e3a8a]'
                          : 'bg-white text-slate-600 ring-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {interval === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={everyDays}
                    onChange={e => setEveryDays(Number(e.target.value) || 1)}
                    className={portalInput + ' w-20 text-xs py-1.5'}
                  />
                  <span className="text-xs text-slate-600">일마다</span>
                </div>
              )}
              <p className="text-[10px] text-slate-400">시작일부터 선택한 주기로 생성됩니다.</p>
            </div>
          )}

          {previewCount != null && (
            <p className="text-[11px] text-slate-500">
              선택한 기간·조건으로 <span className="font-bold text-slate-700">{previewCount}건</span> 등록됩니다.
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">마감기한</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className={portalInput + ' w-full text-xs py-1.5'}
            required
          />
        </div>
      )}

      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="설명 (선택)"
        className={portalInput + ' w-full text-xs py-1.5'}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {isEdit && editItem?.createdAt && (
        <p className="text-xs text-slate-500">
          등록: {formatCalendarCreatedAt(editItem.createdAt)}
        </p>
      )}

      <div className="flex gap-2">
        {isEdit && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !title.trim()}
          className={portalBtnPrimary + ' flex-1 text-xs py-1.5'}
        >
          {saving
            ? '저장 중…'
            : isEdit
              ? '저장'
              : repeatOn && previewCount
                ? `${previewCount}건 추가`
                : '추가'}
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
