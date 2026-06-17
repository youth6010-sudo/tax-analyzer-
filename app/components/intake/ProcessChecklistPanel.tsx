'use client';

import {
  CHECKLIST_KEYS,
  CHECKLIST_LABEL,
  isChecklistItemDone,
  type ProcessRow,
} from './intakeUtils';

export default function ProcessChecklistPanel({
  process,
  inquiryBluehole = '',
  onToggleCheck,
  onSyncBlueholeCheck,
  onEnsureProcess,
}: {
  process: ProcessRow | null;
  inquiryBluehole?: string;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onSyncBlueholeCheck?: (process: ProcessRow) => void | Promise<void>;
  onEnsureProcess: () => Promise<ProcessRow>;
}) {
  const done = process ? checklistDone(process.checklist, inquiryBluehole) : 0;
  const blueholeCode = inquiryBluehole.trim();

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

  return (
    <div className="pt-2 border-t border-indigo-200/60">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-indigo-900">체크리스트</p>
        <span className="text-xs font-semibold text-indigo-700 tabular-nums">
          {done}/{CHECKLIST_KEYS.length}
        </span>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
        {CHECKLIST_KEYS.map(key => {
          const isBluehole = key === 'blueholeClient';
          const checked = isChecklistItemDone(key, process?.checklist, inquiryBluehole);
          return (
            <li key={key}>
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
                <span className={`min-w-0 ${checked ? 'font-semibold line-through decoration-emerald-400/60' : ''}`}>
                  {CHECKLIST_LABEL[key]}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function checklistDone(
  checklist: ProcessRow['checklist'] | undefined,
  inquiryBluehole = '',
) {
  return CHECKLIST_KEYS.filter(k => isChecklistItemDone(k, checklist, inquiryBluehole)).length;
}
