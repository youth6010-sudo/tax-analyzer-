'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CHURN_COLUMNS, churnDateInputValue } from '@/app/config/churnSheet';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';
import {
  ChurnCheckboxGroup,
  ChurnManagerSelect,
  ChurnNumberedField,
} from '@/app/components/churn/ChurnFieldGroups';
import {
  CHURN_TYPE_OPTIONS,
  DATA_CLEANUP_OPTIONS,
  EARLY_SIGN_ITEMS,
  REASON_ITEMS,
} from '@/app/config/churnOptions';
import type { ChurnRecordView } from '@/app/types/client';

type Props = {
  record: ChurnRecordView | null;
  emptyMessage?: string;
  onSaved?: (record: ChurnRecordView) => void;
  onDeleted?: (id: string) => void;
  deleting?: boolean;
};

export default function ChurnRecordPanel({
  record,
  emptyMessage = '항목을 선택하면 유출 상세가 표시됩니다.',
  onSaved,
  onDeleted,
  deleting = false,
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
    manager: '',
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
      manager: record.manager,
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
          manager: form.manager,
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

  const handleDelete = () => {
    if (!record) return;
    const restoreNote = record.clientId
      ? '\n\n연결된 수임처에 다른 유출 이력이 없으면 active로 복구됩니다.'
      : '';
    if (!confirm(`"${record.companyName}" 유출 이력을 삭제할까요?${restoreNote}`)) return;
    onDeleted?.(record.id);
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
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {record.clientId && (
            <Link
              href={`/clients/${record.clientId}`}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-100"
            >
              수임처 상세
            </Link>
          )}
          {!editing && (
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? '…' : '삭제'}
            </button>
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
              <button type="button" onClick={() => setEditing(false)} className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-600 bg-white">
                취소
              </button>
              <button type="button" disabled={saving} onClick={() => void handleSave()} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-600 text-white disabled:opacity-50">
                {saving ? '저장 중…' : '저장'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {!editing ? (
          <div className="space-y-2 text-xs">
            {CHURN_COLUMNS.map(col => {
              let value = '—';
              switch (col.key) {
                case 'companyName': value = record.companyName; break;
                case 'churnedAt': value = new Date(record.churnedAt).toLocaleDateString('ko-KR'); break;
                case 'feeAmount': value = record.feeAmount != null ? `${record.feeAmount.toLocaleString()}원` : '—'; break;
                case 'dataCleanup': value = record.dataCleanup || '—'; break;
                case 'churnType': value = record.churnType || '—'; break;
                case 'earlySign': value = record.earlySign || '—'; break;
                case 'reason': value = record.reason || '—'; break;
                case 'manager': value = record.manager || '—'; break;
              }
              if (col.key === 'companyName') return null;
              return (
                <div key={col.key}>
                  <span className="text-[10px] font-bold text-gray-400">{col.label}</span>
                  <p className="text-gray-800 whitespace-pre-line mt-0.5">{value}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-bold text-gray-400">계약 종료일</span>
                <input type="date" value={form.churnedAt} onChange={e => setForm(f => ({ ...f, churnedAt: e.target.value }))} className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-gray-400">{CLIENT_FIELD_LABELS.fee}</span>
                <input type="text" inputMode="numeric" value={form.feeAmount} onChange={e => setForm(f => ({ ...f, feeAmount: e.target.value }))} className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" />
              </label>
            </div>
            <ChurnManagerSelect value={form.manager} onChange={v => setForm(f => ({ ...f, manager: v }))} disabled={saving} />
            <ChurnCheckboxGroup label="자료 정리" options={DATA_CLEANUP_OPTIONS} value={form.dataCleanup} onChange={v => setForm(f => ({ ...f, dataCleanup: v }))} disabled={saving} />
            <ChurnCheckboxGroup label="유형" options={CHURN_TYPE_OPTIONS} value={form.churnType} onChange={v => setForm(f => ({ ...f, churnType: v }))} disabled={saving} />
            <ChurnNumberedField label="전조증상" items={EARLY_SIGN_ITEMS} value={form.earlySign} onChange={v => setForm(f => ({ ...f, earlySign: v }))} disabled={saving} />
            <ChurnNumberedField label="유출 사유" items={REASON_ITEMS} value={form.reason} onChange={v => setForm(f => ({ ...f, reason: v }))} disabled={saving} />
            <label className="block">
              <span className="text-[10px] font-bold text-gray-400">상세 메모</span>
              <textarea value={form.detail} onChange={e => setForm(f => ({ ...f, detail: e.target.value }))} rows={3} className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </label>
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
