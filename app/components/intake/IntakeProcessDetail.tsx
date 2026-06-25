'use client';

import { useState } from 'react';
import { CHECKLIST_KEYS, CHECKLIST_LABEL_FULL, type ProcessRow } from './intakeUtils';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';

const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none';

function rowFromApi(process: Record<string, unknown>): ProcessRow {
  return {
    id: String(process.id),
    clientId: process.clientId != null ? String(process.clientId) : null,
    companyName: String(process.companyName ?? ''),
    feeStartDate: String(process.feeStartDate ?? ''),
    monthlyFee: typeof process.monthlyFee === 'number' ? process.monthlyFee : null,
    channel: String(process.channel ?? ''),
    checklist: (process.checklist && typeof process.checklist === 'object'
      ? process.checklist
      : {}) as Record<string, boolean>,
    updatedAt: process.updatedAt != null ? String(process.updatedAt) : '',
  };
}

export default function IntakeProcessDetail({
  process,
  onUpdated,
}: {
  process: ProcessRow;
  onUpdated: (row: ProcessRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feeStartDate, setFeeStartDate] = useState(process.feeStartDate);
  const [monthlyFee, setMonthlyFee] = useState(process.monthlyFee != null ? String(process.monthlyFee) : '');
  const [channel, setChannel] = useState(process.channel);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const fee = monthlyFee.trim() ? Number(monthlyFee.replace(/,/g, '')) : null;
      const res = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feeStartDate: feeStartDate.trim(),
          monthlyFee: fee != null && !Number.isNaN(fee) ? fee : null,
          channel: channel.trim(),
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      onUpdated(rowFromApi(data.process));
      setEditing(false);
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-3 mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-blue-600">프로세스 수정</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFeeStartDate(process.feeStartDate);
                setMonthlyFee(process.monthlyFee != null ? String(process.monthlyFee) : '');
                setChannel(process.channel);
                setEditing(false);
                setError('');
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs">
            <span className="font-semibold text-gray-600">수임 시작일</span>
            <input type="date" value={feeStartDate} onChange={e => setFeeStartDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs">
            <span className="font-semibold text-gray-600">{CLIENT_FIELD_LABELS.fee}</span>
            <input value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs">
            <span className="font-semibold text-gray-600">유입</span>
            <input value={channel} onChange={e => setChannel(e.target.value)} className={inputCls} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 pb-4 border-b border-gray-100">
      <div className="flex items-start justify-between gap-2">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3 text-sm flex-1">
          {process.feeStartDate && (
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase">수임 시작일</dt>
              <dd className="text-gray-800">{process.feeStartDate}</dd>
            </div>
          )}
          {process.monthlyFee != null && process.monthlyFee > 0 && (
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase">{CLIENT_FIELD_LABELS.fee}</dt>
              <dd className="text-gray-800">{process.monthlyFee.toLocaleString()}원</dd>
            </div>
          )}
          {process.channel && (
            <div>
              <dt className="text-[10px] font-bold text-gray-400 uppercase">유입</dt>
              <dd className="text-gray-800">{process.channel}</dd>
            </div>
          )}
        </dl>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-white shrink-0"
        >
          수정
        </button>
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase mt-3 mb-2">온보딩 체크 ({CHECKLIST_KEYS.filter(k => process.checklist?.[k]).length}/{CHECKLIST_KEYS.length})</p>
      <ul className="text-xs text-gray-600 space-y-0.5">
        {CHECKLIST_KEYS.filter(k => process.checklist?.[k]).map(k => (
          <li key={k}>✓ {CHECKLIST_LABEL_FULL[k]}</li>
        ))}
        {!CHECKLIST_KEYS.some(k => process.checklist?.[k]) && (
          <li className="text-gray-400">완료된 항목 없음</li>
        )}
      </ul>
    </div>
  );
}
