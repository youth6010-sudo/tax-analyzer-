'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PROCESS_CHECKLIST_TITLES } from '@/app/config/intakeSheets';
import { CHECKLIST_KEYS } from '@/app/types/intake';
import {
  CHECKLIST_LABEL,
  processRowFromApi,
  type InquiryRow,
  type ProcessRow,
} from './intakeUtils';

const inputCls = 'mt-0.5 w-full min-w-0 border border-indigo-200 rounded px-2 py-1.5 text-xs text-gray-900 bg-white focus:ring-1 focus:ring-indigo-400 focus:outline-none';

function defaultCompanyName(inquiry: InquiryRow): string {
  const name = inquiry.companyName.trim();
  return name && name !== '(미입력)' ? name : '';
}

function formFrom(inquiry: InquiryRow, process: ProcessRow | null) {
  return {
    companyName: process?.companyName || defaultCompanyName(inquiry) || inquiry.companyName || '(미입력)',
    feeStartDate: process?.feeStartDate ?? inquiry.inquiryDate ?? '',
    monthlyFee: process?.monthlyFee != null
      ? String(process.monthlyFee)
      : inquiry.proposedFee != null
        ? String(inquiry.proposedFee)
        : '',
    channel: process?.channel || inquiry.channel || '',
  };
}

function canRegister(inquiry: InquiryRow, process: ProcessRow | null): boolean {
  const name = (process?.companyName || inquiry.companyName).trim();
  return Boolean(name && name !== '(미입력)');
}

async function createMinimalProcess(inquiry: InquiryRow): Promise<ProcessRow> {
  const res = await fetch('/api/intake/processes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: inquiry.companyName.trim() || '(미입력)',
      clientId: inquiry.clientId,
      channel: inquiry.channel,
      monthlyFee: inquiry.proposedFee,
      feeStartDate: inquiry.inquiryDate,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '프로세스 생성 실패');
  return processRowFromApi(data.process as Record<string, unknown>);
}

export default function IntakeProcessPanel({
  inquiry,
  process,
  onToggleCheck,
  onProcessUpdated,
  onProcessCreated,
  onRegisterClient,
  savingId,
}: {
  inquiry: InquiryRow;
  process: ProcessRow | null;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onProcessUpdated: (row: ProcessRow) => void;
  onProcessCreated: (row: ProcessRow) => void;
  onRegisterClient: (inquiryId: string, processId: string | null) => Promise<string | null>;
  savingId: string | null;
}) {
  const [form, setForm] = useState(() => formFrom(inquiry, process));
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [registeredClientId, setRegisteredClientId] = useState<string | null>(inquiry.clientId);

  useEffect(() => {
    setForm(formFrom(inquiry, process));
    setRegisteredClientId(inquiry.clientId);
    setError('');
  }, [inquiry, process]);

  const saveMeta = async () => {
    setSaving(true);
    setError('');
    const feeRaw = form.monthlyFee.trim().replace(/,/g, '');
    const monthlyFee = feeRaw ? Number(feeRaw) : null;
    const payload = {
      companyName: form.companyName.trim() || '(미입력)',
      feeStartDate: form.feeStartDate.trim(),
      monthlyFee: monthlyFee != null && !Number.isNaN(monthlyFee) ? monthlyFee : null,
      channel: form.channel.trim(),
    };

    try {
      if (process) {
        const res = await fetch(`/api/processes/${process.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('저장 실패');
        const data = await res.json();
        onProcessUpdated(processRowFromApi(data.process as Record<string, unknown>));
      } else {
        const res = await fetch('/api/intake/processes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, clientId: inquiry.clientId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '등록 실패');
        onProcessCreated(processRowFromApi(data.process as Record<string, unknown>));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleChecklistClick = async (key: string) => {
    setChecking(true);
    setError('');
    try {
      let proc = process;
      if (!proc) {
        proc = await createMinimalProcess(inquiry);
        onProcessCreated(proc);
      }
      await onToggleCheck(proc, key);
    } catch (e) {
      setError(e instanceof Error ? e.message : '체크 저장 실패');
    } finally {
      setChecking(false);
    }
  };

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    try {
      let proc = process;
      if (!proc) {
        proc = await createMinimalProcess(inquiry);
        onProcessCreated(proc);
      }
      const clientId = await onRegisterClient(inquiry.id, proc.id);
      if (clientId) setRegisteredClientId(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '수임처 등록 실패');
    } finally {
      setRegistering(false);
    }
  };

  const done = process ? CHECKLIST_KEYS.filter(k => process.checklist?.[k]).length : 0;
  const checklistBusy = checking || savingId === process?.id;

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4">
        <label className="block text-[11px] col-span-2 sm:col-span-2">
          <span className="font-semibold text-indigo-900">업체명</span>
          <input
            value={form.companyName}
            onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block text-[11px]">
          <span className="font-semibold text-indigo-900">수수료일</span>
          <input
            type="date"
            value={form.feeStartDate}
            onChange={e => setForm(prev => ({ ...prev, feeStartDate: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block text-[11px]">
          <span className="font-semibold text-indigo-900">기장료</span>
          <input
            value={form.monthlyFee}
            onChange={e => setForm(prev => ({ ...prev, monthlyFee: e.target.value }))}
            className={inputCls}
            placeholder="숫자"
          />
        </label>
        <label className="block text-[11px] col-span-2 sm:col-span-3">
          <span className="font-semibold text-indigo-900">유입 경로</span>
          <input
            value={form.channel}
            onChange={e => setForm(prev => ({ ...prev, channel: e.target.value }))}
            className={inputCls}
          />
        </label>
        <div className="col-span-2 sm:col-span-1 flex items-end gap-1.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveMeta()}
            className="flex-1 text-[11px] px-2 py-1.5 rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '…' : '저장'}
          </button>
          {process && (
            <span className="text-[10px] font-semibold text-indigo-800 tabular-nums shrink-0">{done}/{CHECKLIST_KEYS.length}</span>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-1">
        {CHECKLIST_KEYS.map(key => {
          const on = Boolean(process?.checklist?.[key]);
          return (
            <button
              key={key}
              type="button"
              disabled={checklistBusy}
              title={PROCESS_CHECKLIST_TITLES[key]}
              onClick={() => void handleChecklistClick(key)}
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

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-indigo-200/50">
        {registeredClientId ? (
          <Link
            href={`/clients/${registeredClientId}`}
            className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700"
          >
            수임처 →
          </Link>
        ) : (
          <button
            type="button"
            disabled={registering || !canRegister(inquiry, process)}
            onClick={() => void handleRegister()}
            className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800 text-white font-bold hover:bg-slate-900 disabled:opacity-50"
          >
            {registering ? '…' : '수임처 등록'}
          </button>
        )}
      </div>
    </div>
  );
}
