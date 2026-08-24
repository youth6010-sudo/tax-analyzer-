'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { portalInput } from '@/app/components/portal/uiClasses';
import type { YouthIdEntry, YouthIdField } from '@/lib/youthIds';
import { newYouthIdEntryId } from '@/lib/youthIds';

type Props = {
  open: boolean;
  categoryLabel: string;
  staffNames: string[];
  initial?: YouthIdEntry | null;
  onClose: () => void;
  onSave: (entry: YouthIdEntry) => void;
};

const emptyField = (): YouthIdField => ({ label: '', value: '', secret: false });

export default function YouthIdEntryModal({
  open,
  categoryLabel,
  staffNames,
  initial,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<YouthIdField[]>([emptyField()]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    setOwner(initial?.owner ?? '');
    setUrl(initial?.url ?? '');
    setNote(initial?.note ?? '');
    setFields(initial?.fields?.length ? initial.fields.map(f => ({ ...f })) : [emptyField()]);
  }, [open, initial]);

  if (!open || !mounted) return null;

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    const cleaned = fields
      .map(f => ({
        label: f.label.trim(),
        value: f.value,
        secret: f.secret ? true : undefined,
      }))
      .filter(f => f.label);
    onSave({
      id: initial?.id ?? newYouthIdEntryId(t),
      title: t,
      owner: owner.trim() || null,
      url: url.trim() || undefined,
      note: note.trim() || undefined,
      fields: cleaned.length ? cleaned : [{ label: '메모', value: '' }],
    });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900">
          {initial ? '항목 수정' : '항목 추가'} · {categoryLabel}
        </h3>

        <div className="mt-3 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            구분(제목)
            <input
              className={`${portalInput} mt-1`}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예: 홈택스 (블루)"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            담당 (비우면 공용)
            <select
              className={`${portalInput} mt-1`}
              value={owner}
              onChange={e => setOwner(e.target.value)}
            >
              <option value="">공용</option>
              {staffNames.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            URL (선택)
            <input
              className={`${portalInput} mt-1`}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            메모 (선택)
            <input
              className={`${portalInput} mt-1`}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">필드</span>
              <button
                type="button"
                className="text-xs font-semibold text-blue-700 hover:underline"
                onClick={() => setFields(f => [...f, emptyField()])}
              >
                + 필드
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2">
                  <input
                    className={`${portalInput} !py-1.5 min-w-[5rem] flex-1`}
                    placeholder="라벨 (ID, PW…)"
                    value={f.label}
                    onChange={e =>
                      setFields(arr => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <input
                    className={`${portalInput} !py-1.5 min-w-[8rem] flex-[2]`}
                    placeholder="값"
                    value={f.value}
                    onChange={e =>
                      setFields(arr => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                  />
                  <label className="flex items-center gap-1 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!f.secret}
                      onChange={e =>
                        setFields(arr =>
                          arr.map((x, j) => (j === i ? { ...x, secret: e.target.checked } : x)),
                        )
                      }
                    />
                    민감
                  </label>
                  {fields.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => setFields(arr => arr.filter((_, j) => j !== i))}
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!title.trim()}
            onClick={submit}
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
