'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ProcessChecklistPanel from './ProcessChecklistPanel';
import BlueholeRegisterCopyButton from './BlueholeRegisterCopyButton';
import {
  inquiryBlueholeCase,
  processRowFromApi,
  type InquiryRow,
  type ProcessRow,
} from './intakeUtils';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';

const inputCls = 'mt-1 w-full min-w-0 border border-indigo-200 rounded-md px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none';

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
  onProcessUpdated,
  onProcessCreated,
  onRegisterClient,
  onToggleCheck,
  onSyncBlueholeCheck,
  onHideChecklistItem,
  onRestoreChecklist,
  allowRegister = true,
}: {
  inquiry: InquiryRow;
  process: ProcessRow | null;
  onProcessUpdated: (row: ProcessRow) => void;
  onProcessCreated: (row: ProcessRow) => void;
  onRegisterClient: (inquiryId: string, processId: string | null) => Promise<string | null>;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onSyncBlueholeCheck?: (process: ProcessRow) => void | Promise<void>;
  onHideChecklistItem?: (process: ProcessRow, key: string) => void | Promise<void>;
  onRestoreChecklist?: (process: ProcessRow) => void | Promise<void>;
  allowRegister?: boolean;
}) {
  const [form, setForm] = useState(() => formFrom(inquiry, process));
  const [saving, setSaving] = useState(false);
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

  const ensureProcess = async (): Promise<ProcessRow> => {
    if (process) return process;
    const proc = await createMinimalProcess(inquiry);
    onProcessCreated(proc);
    return proc;
  };

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    try {
      const proc = await ensureProcess();
      const clientId = await onRegisterClient(inquiry.id, proc.id);
      if (clientId) setRegisteredClientId(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '수임처 등록 실패');
    } finally {
      setRegistering(false);
    }
  };

  const inquiryBluehole = inquiryBlueholeCase(inquiry.extra);
  const syncedBlueholeRef = useRef<string | null>(null);

  useEffect(() => {
    syncedBlueholeRef.current = null;
  }, [inquiry.id]);

  useEffect(() => {
    if (!process || !inquiryBluehole.trim() || process.checklist?.blueholeClient) return;
    const token = `${process.id}:${inquiryBluehole}`;
    if (syncedBlueholeRef.current === token) return;
    syncedBlueholeRef.current = token;
    void onSyncBlueholeCheck?.(process);
  }, [process?.id, process?.checklist?.blueholeClient, inquiryBluehole, onSyncBlueholeCheck]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <label className="block text-xs col-span-2">
          <span className="font-semibold text-indigo-900">업체명</span>
          <input
            value={form.companyName}
            onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">수수료 발생일</span>
          <input
            type="date"
            value={form.feeStartDate}
            onChange={e => setForm(prev => ({ ...prev, feeStartDate: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">{CLIENT_FIELD_LABELS.fee}</span>
          <input
            value={form.monthlyFee}
            onChange={e => setForm(prev => ({ ...prev, monthlyFee: e.target.value }))}
            className={inputCls}
            placeholder="숫자"
          />
        </label>
        <label className="block text-xs col-span-2 sm:col-span-3">
          <span className="font-semibold text-indigo-900">유입 경로</span>
          <input
            value={form.channel}
            onChange={e => setForm(prev => ({ ...prev, channel: e.target.value }))}
            className={inputCls}
          />
        </label>
        <div className="col-span-2 sm:col-span-1 flex items-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveMeta()}
            className="w-full text-xs px-3 py-2 rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '…' : '저장'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <BlueholeRegisterCopyButton inquiry={inquiry} process={process} />

      <ProcessChecklistPanel
        process={process}
        inquiryBluehole={inquiryBluehole}
        onToggleCheck={onToggleCheck}
        onSyncBlueholeCheck={onSyncBlueholeCheck}
        onEnsureProcess={ensureProcess}
        onHideItem={onHideChecklistItem}
        onRestoreHidden={onRestoreChecklist}
      />

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-200/60">
        {registeredClientId ? (
          <Link
            href={`/clients/${registeredClientId}`}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700"
          >
            수임처 →
          </Link>
        ) : allowRegister && inquiry.id ? (
          <button
            type="button"
            disabled={registering || !canRegister(inquiry, process)}
            onClick={() => void handleRegister()}
            className="text-xs px-3 py-1.5 rounded-md bg-slate-800 text-white font-bold hover:bg-slate-900 disabled:opacity-50"
          >
            {registering ? '…' : '포털 수임처 등록'}
          </button>
        ) : process?.clientId ? (
          <Link
            href={`/clients/${process.clientId}`}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700"
          >
            수임처 →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
