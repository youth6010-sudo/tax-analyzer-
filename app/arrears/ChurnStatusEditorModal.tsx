'use client';

import { useState } from 'react';
import CenterModal from '@/app/components/portal/CenterModal';
import {
  portalAlertError,
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
} from '@/app/components/portal/uiClasses';
import {
  ARREARS_CHIP_COLOR_LABELS,
  ARREARS_CHIP_COLORS,
  arrearsChipColorClass,
  type ArrearsChipColor,
  type ArrearsChurnStatusOption,
} from '@/app/types/arrears';
import { saveArrearsChurnStatuses } from '@/app/arrears/useArrearsChurnStatuses';

type DraftRow = ArrearsChurnStatusOption & { key: string };

const toDraft = (items: ArrearsChurnStatusOption[]): DraftRow[] =>
  items.map(i => ({ ...i, key: i.id }));

/** 해임 구분 선택지 편집 — 저장하면 미수관리·채권관리 배지에 바로 반영 */
export default function ChurnStatusEditorModal({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: ArrearsChurnStatusOption[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<DraftRow[]>(() => toDraft(items));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const patch = (key: string, p: Partial<DraftRow>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...p } : r)));

  const move = (idx: number, dir: -1 | 1) =>
    setRows(prev => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });

  const add = () =>
    setRows(prev => [
      ...prev,
      {
        id: '',
        key: `new-${Date.now()}`,
        label: '',
        color: ARREARS_CHIP_COLORS[prev.length % ARREARS_CHIP_COLORS.length]!,
      },
    ]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveArrearsChurnStatuses(rows.map(({ id, label, color }) => ({ id, label, color })));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenterModal
      open={open}
      title="해임 구분 편집"
      description="이름을 바꾸면 이미 지정된 업체에도 새 이름으로 표시됩니다. 사용 중인 구분은 삭제할 수 없습니다."
      onClose={() => {
        if (!busy) onClose();
      }}
      widthClass="max-w-lg"
    >
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-1.5">
            <span
              className={`inline-flex min-w-[3.5rem] justify-center rounded-full border px-2 py-0.5 text-xs font-medium ${arrearsChipColorClass(r.color)}`}
            >
              {r.label || '이름'}
            </span>
            <input
              className={`${portalInput} flex-1 py-1 text-sm`}
              value={r.label}
              maxLength={20}
              placeholder="구분 이름"
              disabled={busy}
              onChange={e => patch(r.key, { label: e.target.value })}
            />
            <select
              className={`${portalInput} w-[5.5rem] py-1 text-xs`}
              value={r.color}
              disabled={busy}
              onChange={e => patch(r.key, { color: e.target.value as ArrearsChipColor })}
            >
              {ARREARS_CHIP_COLORS.map(c => (
                <option key={c} value={c}>
                  {ARREARS_CHIP_COLOR_LABELS[c]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="px-1 text-slate-500 hover:text-slate-900 disabled:opacity-30"
              disabled={busy || i === 0}
              onClick={() => move(i, -1)}
              title="위로"
            >
              ▲
            </button>
            <button
              type="button"
              className="px-1 text-slate-500 hover:text-slate-900 disabled:opacity-30"
              disabled={busy || i === rows.length - 1}
              onClick={() => move(i, 1)}
              title="아래로"
            >
              ▼
            </button>
            <button
              type="button"
              className="px-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
              disabled={busy || rows.length <= 1}
              onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))}
              title="삭제"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className={`${portalBtnSecondary} w-full`} disabled={busy} onClick={add}>
          + 구분 추가
        </button>
        {error ? <div className={portalAlertError}>{error}</div> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={portalBtnSecondary} disabled={busy} onClick={onClose}>
            취소
          </button>
          <button type="button" className={portalBtnPrimary} disabled={busy} onClick={() => void save()}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </CenterModal>
  );
}
