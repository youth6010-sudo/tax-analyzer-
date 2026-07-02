'use client';

import { useEffect, useState } from 'react';
import type { CompanyEventDto, CompanyScheduleKind } from '@/app/types/calendar';
import { formatCalendarCreatedAt } from '@/app/types/calendar';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title);
      setDescription(editItem.description || '');
      setDueDate(editItem.startDate);
      return;
    }
    setTitle('');
    setDescription('');
    setDueDate(defaultDate || '');
  }, [editItem, defaultDate]);

  const buildPayload = () => ({
    title,
    description,
    scheduleKind: 'deadline' as CompanyScheduleKind,
    startDate: dueDate,
    endDate: dueDate,
  });

  const submit = async () => {
    if (!dueDate) {
      alert('마감기한을 입력하세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      const res = await fetch('/api/calendar/company-events', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit && editItem ? { id: editItem.id, ...payload } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      if (!isEdit) {
        setTitle('');
        setDescription('');
        onCreated?.();
      } else {
        onUpdated?.();
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
          {saving ? '저장 중…' : isEdit ? '저장' : '추가'}
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
