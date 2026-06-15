'use client';

import { useState } from 'react';
import { EXTERNAL_SYSTEMS } from '@/app/config/externalSystems';
import { CHECKLIST_KEYS } from '@/app/types/intake';
import type { ChecklistKey } from '@/app/types/intake';
import type { ProcessChecklist } from '@/app/types/externalRefs';
import { buildBlueholeCaseUrl } from '@/app/config/bluehole';
import { registrationPackageFromInquiry } from '@/app/utils/registrationPackage';
import BlueholeCaseLink from './BlueholeCaseLink';
import {
  CHECKLIST_LABEL,
  CHECKLIST_LABEL_FULL,
  inquiryBlueholeCase,
  type InquiryRow,
  type ProcessRow,
} from './intakeUtils';

const ONBOARDING_SYSTEM_KEYS = ['bluehole', 'tp', 'semorang', 'wemembers'] as const;

function checklistMeta(checklist: ProcessChecklist | undefined, key: string): string | null {
  const entry = checklist?._meta?.[key];
  if (!entry) return null;
  const d = new Date(entry.at);
  const when = Number.isNaN(d.getTime()) ? entry.at : d.toLocaleDateString('ko-KR');
  return `${entry.by} · ${when}`;
}

export default function OnboardingBoard({
  inquiry,
  process,
  onToggleCheck,
  onSaveBlueholeCase,
  onSaveExternalRef,
  savingId,
  checking,
}: {
  inquiry: InquiryRow;
  process: ProcessRow | null;
  onToggleCheck: (process: ProcessRow, key: ChecklistKey) => void | Promise<void>;
  onSaveBlueholeCase: (caseId: string) => Promise<void>;
  onSaveExternalRef: (system: 'tp' | 'semorang' | 'wemembers', id: string) => Promise<void>;
  savingId: string | null;
  checking: boolean;
}) {
  const [blueholeInput, setBlueholeInput] = useState(inquiryBlueholeCase(inquiry.extra));
  const [extIds, setExtIds] = useState<Record<string, string>>({ tp: '', semorang: '', wemembers: '' });
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [savingBh, setSavingBh] = useState(false);

  const checklist = (process?.checklist ?? {}) as ProcessChecklist;
  const done = CHECKLIST_KEYS.filter(k => checklist[k]).length;
  const packageText = registrationPackageFromInquiry(inquiry);

  const copyPackage = async () => {
    await navigator.clipboard.writeText(packageText);
    setCopyMsg('등록 패키지가 복사되었습니다.');
    setTimeout(() => setCopyMsg(null), 2500);
  };

  const saveBluehole = async () => {
    setSavingBh(true);
    try {
      await onSaveBlueholeCase(blueholeInput.trim());
    } finally {
      setSavingBh(false);
    }
  };

  const systemChecklistKey = (sysId: typeof ONBOARDING_SYSTEM_KEYS[number]): ChecklistKey => {
    const sys = EXTERNAL_SYSTEMS[sysId];
    return sys.checklistKey as ChecklistKey;
  };

  return (
    <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black text-indigo-900">다중 시스템 온보딩</h3>
          <p className="text-[10px] text-indigo-700/80 mt-0.5">
            블루홀 · TP · 세무사랑 · 위멤버스 · 포털 — 한 화면에서 진행
          </p>
        </div>
        <span className="text-[10px] font-bold text-indigo-800 tabular-nums">{done}/{CHECKLIST_KEYS.length}</span>
      </div>

      <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-bold text-gray-600">등록 패키지</span>
          <button
            type="button"
            onClick={() => void copyPackage()}
            className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-900"
          >
            전체 복사
          </button>
        </div>
        <pre className="text-[10px] text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-28 overflow-y-auto">
          {packageText}
        </pre>
        {copyMsg && <p className="text-[10px] text-green-700 mt-1">{copyMsg}</p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ONBOARDING_SYSTEM_KEYS.map(sysId => {
          const sys = EXTERNAL_SYSTEMS[sysId];
          const cKey = systemChecklistKey(sysId);
          const on = Boolean(checklist[cKey]);
          const meta = checklistMeta(checklist, cKey);

          return (
            <div
              key={sysId}
              className={`rounded-lg border p-2.5 ${on ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-100 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[11px] font-bold text-gray-800">{sys.label}</span>
                <button
                  type="button"
                  disabled={checking || !process || savingId === process.id}
                  title={CHECKLIST_LABEL_FULL[cKey]}
                  onClick={() => process && void onToggleCheck(process, cKey)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    on ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {on ? '완료' : '미완료'}
                </button>
              </div>
              <p className="text-[9px] text-gray-500 mt-1">{sys.copyHint}</p>
              {meta && <p className="text-[9px] text-emerald-700 mt-0.5">{meta}</p>}

              {sysId === 'bluehole' && (
                <div className="mt-2 flex gap-1">
                  <input
                    value={blueholeInput}
                    onChange={e => setBlueholeInput(e.target.value)}
                    placeholder="#11364"
                    className="flex-1 min-w-0 text-[10px] border border-gray-200 rounded px-2 py-1"
                  />
                  <button
                    type="button"
                    disabled={savingBh || !blueholeInput.trim()}
                    onClick={() => void saveBluehole()}
                    className="text-[10px] font-bold px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
                  >
                    저장
                  </button>
                </div>
              )}

              {sysId === 'bluehole' && blueholeInput.trim() && (
                <div className="mt-1">
                  <BlueholeCaseLink value={blueholeInput} className="text-[10px]" />
                </div>
              )}

              {sysId !== 'bluehole' && (
                <div className="mt-2 flex gap-1">
                  <input
                    value={extIds[sysId] ?? ''}
                    onChange={e => setExtIds(prev => ({ ...prev, [sysId]: e.target.value }))}
                    placeholder="등록 후 ID/코드 (선택)"
                    className="flex-1 min-w-0 text-[10px] border border-gray-200 rounded px-2 py-1"
                  />
                  <button
                    type="button"
                    disabled={!extIds[sysId]?.trim()}
                    onClick={() => void onSaveExternalRef(sysId, extIds[sysId]!.trim())}
                    className="text-[10px] font-bold px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                  >
                    기록
                  </button>
                </div>
              )}

              {sys.href && (
                <a
                  href={sys.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1.5 text-[10px] font-semibold text-blue-600 hover:underline"
                >
                  {sys.label} 열기 →
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1 pt-1 border-t border-indigo-100">
        {CHECKLIST_KEYS.filter(k => !ONBOARDING_SYSTEM_KEYS.some(s => EXTERNAL_SYSTEMS[s].checklistKey === k)).map(key => {
          const on = Boolean(checklist[key]);
          return (
            <button
              key={key}
              type="button"
              disabled={checking || !process || savingId === process?.id}
              title={CHECKLIST_LABEL_FULL[key]}
              onClick={() => process && void onToggleCheck(process, key)}
              className={`text-[10px] leading-none px-1.5 py-1 rounded border transition-colors ${
                on
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                  : 'bg-white border-indigo-100 text-gray-500 hover:border-indigo-300'
              } disabled:opacity-50`}
            >
              <span className="font-black">{on ? 'O' : '·'}</span> {CHECKLIST_LABEL[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function openBlueholeCase(caseId: string) {
  const url = buildBlueholeCaseUrl(caseId);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
