'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ConsultationFormConfig } from '../../types/consultation';
import { allFormKeys, applyConsultationLinks } from '@/lib/consultationFormLinks';
import {
  buildBookkeepingConsultSheetText,
  formRecordToBookkeepingSource,
} from '@/lib/bookkeepingConsultCopy';
import BookkeepingConsultCopyButton from './BookkeepingConsultCopyButton';
import ConsultationPhaseGrid, {
  CONSULT_MULTI_VALUE_DELIM,
  CONSULT_REGISTER_REQUIRED_KEYS,
  isConsultRequiredFilled,
  splitConsultMultiValue,
} from './ConsultationPhaseGrid';

type DraftSummary = {
  id: string;
  companyName: string;
  stepIdx: number;
  stepTitle: string;
  updatedAt: string;
};

function emptyForm(config: ConsultationFormConfig): Record<string, string> {
  const init: Record<string, string> = {};
  for (const key of allFormKeys(config)) init[key] = '';
  return init;
}

function mergeForm(config: ConsultationFormConfig, saved: Record<string, unknown>): Record<string, string> {
  const init = emptyForm(config);
  for (const key of Object.keys(init)) {
    const v = saved[key];
    if (Array.isArray(v)) init[key] = v.map(item => String(item).trim()).filter(Boolean).join(CONSULT_MULTI_VALUE_DELIM);
    else if (v != null) init[key] = String(v);
  }
  return applyConsultationLinks(init);
}

export default function ConsultationFormPanel({
  onSuccess,
  initialDraftId,
}: {
  onSuccess?: (result: { inquiryId: string; processId: string | null }) => void;
  initialDraftId?: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<ConsultationFormConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const bookkeepingCopyText = useMemo(
    () => buildBookkeepingConsultSheetText(formRecordToBookkeepingSource(applyConsultationLinks(form))),
    [form],
  );

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
    setForm(prev => applyConsultationLinks({ ...prev, [key]: v }));
    setDraftMsg(null);
  }, []);

  const buildPayload = (): Record<string, unknown> => {
    const linked = applyConsultationLinks(form);
    const payload: Record<string, unknown> = { ...linked };
    if (linked.proposedFee) payload.proposedFee = Number(linked.proposedFee);
    if (linked.consultTypes) payload.consultTypes = splitConsultMultiValue(linked.consultTypes);
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
          stepIdx: 0,
          stepTitle: '2단계 통합',
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
      router.replace('/clients/intake?tab=consultation', { scroll: false });
    }
    await loadDrafts();
  };

  const startNew = () => {
    if (config) setForm(emptyForm(config));
    setDraftId(null);
    setDraftMsg(null);
    setError(null);
    router.replace('/clients/intake?tab=consultation', { scroll: false });
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
        onSuccess({
          inquiryId: String(data.inquiryId),
          processId: data.processId != null ? String(data.processId) : null,
        });
      } else {
        router.push(`/clients/intake?tab=intake&inquiry=${data.inquiryId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const registerNow = async () => {
    for (const key of CONSULT_REGISTER_REQUIRED_KEYS) {
      const value = form[key] ?? '';
      if (isConsultRequiredFilled(key, value)) continue;
      if (key === 'phone') {
        setError('연락처를 입력해 주세요.');
      } else if (key === 'companyName') {
        setError('상호명을 입력해 주세요.');
      } else if (key === 'consultTypes') {
        setError('문의 유형을 하나 이상 선택해 주세요.');
      } else {
        setError('필수 항목을 입력해 주세요.');
      }
      return;
    }
    await doSubmit();
  };

  const canRegister = [...CONSULT_REGISTER_REQUIRED_KEYS].every(key =>
    isConsultRequiredFilled(key, form[key] ?? ''),
  );

  if (!config || !ready) {
    return <p className="text-sm text-gray-400 py-8 text-center">불러오는 중…</p>;
  }

  const busy = saving || draftSaving;

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900">{config.title}</h2>
          {config.subtitle && <p className="text-xs text-gray-500 mt-0.5">{config.subtitle}</p>}
          <p className="mt-1 text-[11px] font-semibold text-rose-600">
            <span className="font-bold">*</span> 필수 입력 항목
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draftId && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              작성 중 (초안)
            </span>
          )}
          <BookkeepingConsultCopyButton text={bookkeepingCopyText} />
        </div>
      </div>

      {drafts.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
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

      <ConsultationPhaseGrid config={config} form={form} onChange={onChange} />

      {draftMsg && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {draftMsg}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/clients/intake?tab=intake"
          className="px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl bg-white"
        >
          취소
        </Link>
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={busy}
          className="px-4 py-2.5 text-sm font-semibold border border-amber-200 rounded-xl bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {draftSaving ? '저장 중…' : '중간 저장'}
        </button>
        <button
          type="button"
          onClick={() => void registerNow()}
          disabled={busy || !canRegister}
          title={!canRegister ? '연락처와 상호명을 입력하면 등록할 수 있어요' : undefined}
          className="flex-1 min-w-[10rem] py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? '등록 중…' : '✓ 상담 등록'}
        </button>
      </div>

      <p className="mt-2 text-center text-[10px] text-gray-400">
        <span className="font-bold text-rose-600">*</span> 연락처·상호명·문의유형 필수 · 기장·신고는 체크리스트·담당자 알림 대상 · 초회상담자는 로그인 계정으로 자동 기록(유입프로세스에서 수정 가능)
      </p>
    </div>
  );
}
