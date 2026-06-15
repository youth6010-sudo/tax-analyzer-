'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CHURN_COLUMNS,
  CHURN_EDITABLE_COLUMNS,
  churnDateInputValue,
} from '@/app/config/churnSheet';
import ChurnExamplesPanel, { appendChurnFieldValue } from '@/app/components/churn/ChurnExamplesPanel';
import type { ChurnExampleField } from '@/app/config/churnExamples';
import type { ChurnRecordView } from '@/app/types/client';
import { CHURN_REASONS } from '@/app/types/client';

type Props = {
  record: ChurnRecordView | null;
  emptyMessage?: string;
  onSaved?: (record: ChurnRecordView) => void;
};

export default function ChurnRecordPanel({
  record,
  emptyMessage = '항목을 선택하면 유출 상세가 표시됩니다.',
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    churnedAt: '',
    feeAmount: '',
    dataCleanup: '',
    churnType: '',
    earlySign: '',
    reason: '',
    detail: '',
  });

  useEffect(() => {
    if (!record) return;
    setForm({
      churnedAt: churnDateInputValue(record.churnedAt),
      feeAmount: record.feeAmount != null ? String(record.feeAmount) : '',
      dataCleanup: record.dataCleanup,
      churnType: record.churnType,
      earlySign: record.earlySign,
      reason: record.reason,
      detail: record.detail,
    });
    setEditing(false);
  }, [record]);

  if (!record) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  const handleSave = async () => {
    if (!form.reason.trim()) {
      alert('유출 사유를 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      const parsedFee = form.feeAmount.trim() ? Number(form.feeAmount.replace(/,/g, '')) : null;
      const res = await fetch(`/api/churn/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: form.reason.trim(),
          detail: form.detail,
          churnedAt: form.churnedAt,
          feeAmount: parsedFee != null && !Number.isNaN(parsedFee) ? parsedFee : null,
          dataCleanup: form.dataCleanup,
          churnType: form.churnType,
          earlySign: form.earlySign,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setEditing(false);
      onSaved?.(data.record);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-gray-900">{record.companyName}</h2>
          <p className="text-xs text-red-700 font-semibold mt-0.5">
            계약 종료 · {new Date(record.churnedAt).toLocaleDateString('ko-KR')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {record.clientId && (
            <Link
              href={`/clients/${record.clientId}`}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-100"
            >
              수임처 상세
            </Link>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
            >
              수정
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-600 bg-white"
              >
                취소
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-600 text-white disabled:opacity-50"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {!editing ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {CHURN_COLUMNS.map(col => (
                    <th
                      key={col.key}
                      className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 whitespace-nowrap"
                      style={{ minWidth: col.width }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {CHURN_COLUMNS.map(col => {
                    let value = '—';
                    switch (col.key) {
                      case 'companyName':
                        value = record.companyName;
                        break;
                      case 'churnedAt':
                        value = new Date(record.churnedAt).toLocaleDateString('ko-KR');
                        break;
                      case 'feeAmount':
                        value = record.feeAmount != null ? `${record.feeAmount.toLocaleString()}원` : '—';
                        break;
                      case 'dataCleanup':
                        value = record.dataCleanup || '—';
                        break;
                      case 'churnType':
                        value = record.churnType || '—';
                        break;
                      case 'earlySign':
                        value = record.earlySign || '—';
                        break;
                      case 'reason':
                        value = record.reason || '—';
                        break;
                      case 'manager':
                        value = record.manager || '—';
                        break;
                    }
                    return (
                      <td key={col.key} className="px-2 py-2 text-xs text-gray-800 border-b border-gray-50">
                        {value}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 rounded-lg px-3 py-2 bg-gray-50">
              <span className="text-[10px] font-bold text-gray-400 block">업체명</span>
              <span className="text-sm font-semibold text-gray-800">{record.companyName}</span>
            </div>
            {CHURN_EDITABLE_COLUMNS.map(col => {
              const key = col.key as keyof typeof form;
              if (col.type === 'date') {
                return (
                  <label key={col.key} className="block">
                    <span className="text-[10px] font-bold text-gray-400">{col.label}</span>
                    <input
                      type="date"
                      value={form.churnedAt}
                      onChange={e => setForm(f => ({ ...f, churnedAt: e.target.value }))}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </label>
                );
              }
              if (col.type === 'number') {
                return (
                  <label key={col.key} className="block">
                    <span className="text-[10px] font-bold text-gray-400">{col.label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.feeAmount}
                      onChange={e => setForm(f => ({ ...f, feeAmount: e.target.value }))}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono"
                    />
                  </label>
                );
              }
              if (col.key === 'reason') {
                return (
                  <label key={col.key} className="block sm:col-span-2">
                    <span className="text-[10px] font-bold text-gray-400">{col.label}</span>
                    <input
                      type="text"
                      list="churn-edit-reason-suggestions"
                      value={form.reason}
                      onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    />
                    <datalist id="churn-edit-reason-suggestions">
                      {CHURN_REASONS.map(r => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  </label>
                );
              }
              return (
                <label key={col.key} className="block">
                  <span className="text-[10px] font-bold text-gray-400">{col.label}</span>
                  <input
                    type="text"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  />
                </label>
              );
            })}
            <label className="block sm:col-span-2">
              <span className="text-[10px] font-bold text-gray-400">상세 메모</span>
              <textarea
                value={form.detail}
                onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
                rows={3}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <div className="sm:col-span-2">
              <ChurnExamplesPanel
                disabled={saving}
                onApply={(field: ChurnExampleField, text: string) => {
                  setForm(f => ({
                    ...f,
                    [field]: appendChurnFieldValue(f[field], text),
                  }));
                }}
              />
            </div>
            <div className="sm:col-span-2 rounded-lg px-3 py-2 bg-gray-50">
              <span className="text-[10px] font-bold text-gray-400 block">담당</span>
              <span className="text-sm text-gray-700">{record.manager || '—'}</span>
            </div>
          </div>
        )}

        {!editing && record.detail.trim() && (
          <div className="rounded-lg px-3 py-2 bg-gray-50 mt-3">
            <span className="text-[10px] font-bold text-gray-400 block">상세 메모</span>
            <p className="text-sm text-gray-700 whitespace-pre-line mt-0.5">{record.detail}</p>
          </div>
        )}

        <p className="text-[10px] text-gray-400 pt-3 mt-3 border-t border-gray-100">
          기록 {record.recordedByName ?? '-'}
        </p>
      </div>
    </div>
  );
}
