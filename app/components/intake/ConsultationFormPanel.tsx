'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ConsultationField, ConsultationFormConfig, ConsultationStep } from '../../types/consultation';
import { getActiveSteps, isFieldVisible, phaseLabel } from '../../types/consultation';

type DraftSummary = {
  id: string;
  companyName: string;
  stepIdx: number;
  stepTitle: string;
  updatedAt: string;
};

function FieldRow({ field, value, onChange }: { field: ConsultationField; value: string; onChange: (v: string) => void }) {
  const base = 'mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none';
  if (field.type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className={base}
        placeholder={field.placeholder}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={base}>
        {(field.options ?? []).map(o => (
          <option key={o} value={o}>{o || '선택…'}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={base}
      placeholder={field.placeholder}
    />
  );
}

function StepProgress({
  config,
  steps,
  current,
  onJump,
}: {
  config: ConsultationFormConfig;
  steps: ConsultationStep[];
  current: number;
  onJump: (idx: number) => void;
}) {
  const cur = steps[current];
  const phaseOrder = config.phases.map(p => p.id);
  const curPhaseIdx = phaseOrder.indexOf(cur?.phase ?? '');
  const firstStepOfPhase = (pid: string) => steps.findIndex(s => s.phase === pid);

  return (
    <div className="mb-5">
      <div className="flex flex-wrap gap-1 mb-2">
        {config.phases.map((p, i) => {
          const active = cur?.phase === p.id;
          const done = curPhaseIdx > i;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                const idx = firstStepOfPhase(p.id);
                if (idx >= 0) onJump(idx);
              }}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : done
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {steps.map((s, i) => {
          const active = i === current;
          const done = i < current;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onJump(i)}
              title={s.title}
              className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : done
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s.order}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-bold text-blue-600">단계 {cur?.order ?? 0}/{steps.length}</span>
        <span>· {cur?.title}</span>
      </div>
      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${((current + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function emptyForm(config: ConsultationFormConfig): Record<string, string> {
  const init: Record<string, string> = {};
  getActiveSteps(config).forEach(s => s.fields.forEach(f => { init[f.key] = ''; }));
  return init;
}

function mergeForm(config: ConsultationFormConfig, saved: Record<string, unknown>): Record<string, string> {
  const init = emptyForm(config);
  for (const key of Object.keys(init)) {
    const v = saved[key];
    if (v != null) init[key] = String(v);
  }
  return init;
}

export default function ConsultationFormPanel({
  onSuccess,
  initialDraftId,
}: {
  onSuccess?: (result: { inquiryId: string; processId: string }) => void;
  initialDraftId?: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<ConsultationFormConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const steps = useMemo(() => (config ? getActiveSteps(config) : []), [config]);
  const currentStep = steps[stepIdx];

  const loadDrafts = useCallback(async () => {
    const res = await fetch('/api/consultation/drafts');
    if (!res.ok) return;
    const data = await res.json();
    setDrafts(data.items ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const configRes = await fetch('/data/new-consultation-form.json');
      const c = (await configRes.json()) as ConsultationFormConfig;
      if (cancelled) return;
      setConfig(c);

      await loadDrafts();

      const targetDraftId = initialDraftId ?? null;
      if (targetDraftId) {
        const draftRes = await fetch(`/api/consultation/drafts/${targetDraftId}`);
        if (draftRes.ok) {
          const draft = await draftRes.json();
          if (!cancelled) {
            setDraftId(String(draft.id));
            setForm(mergeForm(c, draft.form ?? {}));
            setStepIdx(typeof draft.stepIdx === 'number' ? draft.stepIdx : 0);
          }
        } else if (!cancelled) {
          setForm(emptyForm(c));
        }
      } else if (!cancelled) {
        setForm(emptyForm(c));
      }

      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [initialDraftId, loadDrafts]);

  const onChange = useCallback((key: string, v: string) => {
    setForm(prev => ({ ...prev, [key]: v }));
    setDraftMsg(null);
  }, []);

  const visibleFields = useMemo(
    () => currentStep?.fields.filter(f => isFieldVisible(f, form)) ?? [],
    [currentStep, form],
  );

  const validateStep = (): string | null => {
    if (!currentStep) return null;
    for (const f of visibleFields) {
      if (f.required && !form[f.key]?.trim()) return `${f.label}을(를) 입력해 주세요.`;
    }
    return null;
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = { ...form };
    if (form.proposedFee) payload.proposedFee = Number(form.proposedFee);
    return payload;
  };

  const saveDraft = async () => {
    setDraftSaving(true);
    setError(null);
    setDraftMsg(null);
    try {
      const res = await fetch('/api/consultation/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: draftId ?? undefined,
          data: buildPayload(),
          stepIdx,
          stepTitle: currentStep?.title ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setDraftId(String(data.inquiryId));
      setDraftMsg('중간 저장되었습니다. 나중에 이어서 작성할 수 있습니다.');
      await loadDrafts();
      if (!initialDraftId && data.inquiryId) {
        router.replace(`/clients/intake?tab=consultation&draft=${data.inquiryId}`, { scroll: false });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '중간 저장하지 못했습니다.');
    } finally {
      setDraftSaving(false);
    }
  };

  const resumeDraft = (id: string) => {
    router.push(`/clients/intake?tab=consultation&draft=${id}`);
  };

  const deleteDraft = async (id: string) => {
    if (!window.confirm('이 초안을 삭제할까요?')) return;
    const res = await fetch(`/api/consultation/drafts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('초안을 삭제하지 못했습니다.');
      return;
    }
    if (draftId === id) {
      setDraftId(null);
      if (config) setForm(emptyForm(config));
      setStepIdx(0);
      router.replace('/clients/intake?tab=consultation', { scroll: false });
    }
    await loadDrafts();
  };

  const startNew = () => {
    if (config) setForm(emptyForm(config));
    setStepIdx(0);
    setDraftId(null);
    setDraftMsg(null);
    setError(null);
    router.replace('/clients/intake?tab=consultation', { scroll: false });
  };

  const goTo = (idx: number) => {
    setError(null);
    setStepIdx(Math.max(0, Math.min(steps.length - 1, idx)));
  };

  const goNext = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    if (stepIdx < steps.length - 1) setStepIdx(stepIdx + 1);
    else void registerNow();
  };

  const goPrev = () => {
    setError(null);
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const doSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: buildPayload(), draftId: draftId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      if (onSuccess) {
        onSuccess({ inquiryId: String(data.inquiryId), processId: String(data.processId) });
      } else {
        router.push(`/clients/intake?tab=intake&inquiry=${data.inquiryId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 전화 상담만으로도 즉시 등록 — 서버 필수값(상호명)만 검증. 나머지는 이후 단계/프로세스에서 보완.
  const registerNow = async () => {
    if (!form.companyName?.trim()) {
      const idx = steps.findIndex(s => s.fields.some(f => f.key === 'companyName'));
      if (idx >= 0) setStepIdx(idx);
      setError('상호명만 입력하면 바로 등록할 수 있어요. (전화 상담 1단계)');
      return;
    }
    await doSubmit();
  };

  if (!config || !currentStep || !ready) {
    return <p className="text-sm text-gray-400 py-8 text-center">불러오는 중…</p>;
  }

  const isLast = stepIdx === steps.length - 1;
  const busy = saving || draftSaving;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900">{config.title}</h2>
          {config.subtitle && <p className="text-xs text-gray-500 mt-0.5">{config.subtitle}</p>}
        </div>
        {draftId && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
            작성 중 (초안)
          </span>
        )}
      </div>

      {drafts.length > 0 && (
        <section className="mb-5 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-bold text-amber-900">저장된 초안</h3>
            <button
              type="button"
              onClick={startNew}
              className="text-[10px] font-semibold text-amber-800 hover:underline"
            >
              새 상담 시작
            </button>
          </div>
          <ul className="space-y-2">
            {drafts.map(d => (
              <li
                key={d.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  d.id === draftId ? 'border-amber-300 bg-white' : 'border-amber-100 bg-white/80'
                }`}
              >
                <span className="font-semibold text-gray-800 flex-1 min-w-[8rem]">
                  {d.companyName || '(상호 미입력)'}
                </span>
                <span className="text-gray-500">{d.stepTitle || `단계 ${d.stepIdx + 1}`}</span>
                <button
                  type="button"
                  onClick={() => resumeDraft(d.id)}
                  className="font-bold text-blue-600 hover:underline"
                >
                  이어 작성
                </button>
                <button
                  type="button"
                  onClick={() => void deleteDraft(d.id)}
                  className="text-gray-400 hover:text-red-600"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <StepProgress config={config} steps={steps} current={stepIdx} onJump={goTo} />

      <article className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
        <header className="px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">
            {phaseLabel(config, currentStep.phase)}
          </p>
          <h3 className="text-base font-black text-gray-900 mt-0.5">{currentStep.title}</h3>
          {currentStep.description && (
            <p className="text-sm text-gray-600 mt-1">{currentStep.description}</p>
          )}
          {currentStep.guide && (
            <p className="mt-2 text-xs text-blue-800 bg-blue-100/60 rounded-lg px-3 py-2 border-l-2 border-blue-400">
              {currentStep.guide}
            </p>
          )}
        </header>

        <div className="p-5 space-y-4">
          {visibleFields.map(f => (
            <label key={f.key} className="block">
              <span className="text-sm font-semibold text-gray-700">
                {f.label}{f.required ? ' *' : ''}
              </span>
              <FieldRow field={f} value={form[f.key] ?? ''} onChange={v => onChange(f.key, v)} />
            </label>
          ))}
        </div>
      </article>

      {draftMsg && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{draftMsg}</div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {stepIdx > 0 ? (
          <button
            type="button"
            onClick={goPrev}
            disabled={busy}
            className="px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            이전
          </button>
        ) : (
          <Link href="/clients/intake?tab=intake" className="px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl bg-white">
            취소
          </Link>
        )}
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={busy}
          className="px-4 py-2.5 text-sm font-semibold border border-amber-200 rounded-xl bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {draftSaving ? '저장 중…' : '중간 저장'}
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className="px-4 py-2.5 text-sm font-semibold border border-blue-200 rounded-xl bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            다음 단계 →
          </button>
        )}
        <button
          type="button"
          onClick={() => void registerNow()}
          disabled={busy || !form.companyName?.trim()}
          title={!form.companyName?.trim() ? '상호명을 입력하면 등록할 수 있어요' : undefined}
          className="flex-1 min-w-[8rem] py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? '등록 중…' : '✓ 상담 등록'}
        </button>
      </div>

      <p className="mt-2 text-center text-[10px] text-gray-400">
        단계 번호를 눌러 자유롭게 이동할 수 있어요 · 상호명만 있으면 언제든 「상담 등록」 가능 · 나머지는 등록 후 보완
      </p>
    </div>
  );
}

