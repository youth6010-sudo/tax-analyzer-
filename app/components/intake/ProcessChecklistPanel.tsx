'use client';

import {
  CHECKLIST_KEYS,
  CHECKLIST_LABEL,
  isChecklistItemDone,
  type ProcessRow,
} from './intakeUtils';

function hiddenKeysOf(checklist: ProcessRow['checklist'] | undefined): string[] {
  const raw = checklist?._hidden;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

export default function ProcessChecklistPanel({
  process,
  inquiryBluehole = '',
  onToggleCheck,
  onSyncBlueholeCheck,
  onEnsureProcess,
  onHideItem,
  onRestoreHidden,
}: {
  process: ProcessRow | null;
  inquiryBluehole?: string;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onSyncBlueholeCheck?: (process: ProcessRow) => void | Promise<void>;
  onEnsureProcess: () => Promise<ProcessRow>;
  onHideItem?: (process: ProcessRow, key: string) => void | Promise<void>;
  onRestoreHidden?: (process: ProcessRow) => void | Promise<void>;
}) {
  const hidden = hiddenKeysOf(process?.checklist);
  const visibleKeys = CHECKLIST_KEYS.filter(k => !hidden.includes(k));
  const blueholeCode = inquiryBluehole.trim();
  const done = process
    ? visibleKeys.filter(k => isChecklistItemDone(k, process.checklist, inquiryBluehole)).length
    : 0;

  const handleToggle = async (key: string) => {
    const proc = process ?? (await onEnsureProcess());
    await onToggleCheck(proc, key);
  };

  const handleBlueholeToggle = async () => {
    const proc = process ?? (await onEnsureProcess());
    if (blueholeCode && !proc.checklist?.blueholeClient && onSyncBlueholeCheck) {
      await onSyncBlueholeCheck(proc);
      return;
    }
    await onToggleCheck(proc, 'blueholeClient');
  };

  const handleHide = async (key: string) => {
    if (!onHideItem) return;
    const proc = process ?? (await onEnsureProcess());
    await onHideItem(proc, key);
  };

  const handleRestore = async () => {
    if (!onRestoreHidden || !process) return;
    await onRestoreHidden(process);
  };

  return (
    <div className="pt-2 border-t border-indigo-200/60">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-indigo-900">체크리스트</p>
        <div className="flex items-center gap-2">
          {hidden.length > 0 && onRestoreHidden && (
            <button
              type="button"
              onClick={() => void handleRestore()}
              className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 hover:underline"
              title="숨긴 항목을 모두 다시 표시합니다"
            >
              숨김 {hidden.length}개 복원
            </button>
          )}
          <span className="text-xs font-semibold text-indigo-700 tabular-nums">
            {done}/{visibleKeys.length}
          </span>
        </div>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
        {visibleKeys.map(key => {
          const isBluehole = key === 'blueholeClient';
          const checked = isChecklistItemDone(key, process?.checklist, inquiryBluehole);
          return (
            <li key={key} className="group relative">
              <label
                title={CHECKLIST_LABEL[key]}
                className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 h-full text-xs leading-snug cursor-pointer transition-colors ${
                  checked
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                    : 'bg-white hover:bg-indigo-50/70 text-gray-800 border border-indigo-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => void (isBluehole ? handleBlueholeToggle() : handleToggle(key))}
                  className="mt-0.5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                />
                <span className={`min-w-0 pr-3 ${checked ? 'font-semibold line-through decoration-emerald-400/60' : ''}`}>
                  {CHECKLIST_LABEL[key]}
                </span>
              </label>
              {onHideItem && (
                <button
                  type="button"
                  onClick={() => void handleHide(key)}
                  title="이 업체 체크리스트에서 항목 삭제"
                  aria-label={`${CHECKLIST_LABEL[key]} 삭제`}
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
