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
    <div className="pt-1.5 border-t border-indigo-200/50">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[10px] font-black text-indigo-900">유입프로세스</p>
        <span className="text-[9px] font-bold text-indigo-700 tabular-nums">
          {done}/{CHECKLIST_KEYS.length}
        </span>
      </div>

      <ul className="grid grid-cols-5 gap-1">
        {CHECKLIST_KEYS.map(key => {
          const isBluehole = key === 'blueholeClient';
          const checked = isChecklistItemDone(key, process?.checklist, inquiryBluehole);
          return (
            <li key={key}>
              <label
                title={CHECKLIST_LABEL[key]}
                className={`flex items-start gap-1 rounded px-1 py-1 h-full text-[9px] leading-tight cursor-pointer transition-colors ${
                  checked ? 'bg-emerald-50 text-emerald-900' : 'bg-white hover:bg-indigo-50/60 text-gray-800 border border-indigo-100/80'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => void (isBluehole ? handleBlueholeToggle() : handleToggle(key))}
                  className="mt-0.5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 scale-90"
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
