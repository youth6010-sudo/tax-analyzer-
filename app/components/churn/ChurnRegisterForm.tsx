'use client';

import ChurnClientSearch from '@/app/components/churn/ChurnClientSearch';
import ChurnExamplesPanel, { appendChurnFieldValue } from '@/app/components/churn/ChurnExamplesPanel';
import { CHURN_COLUMNS } from '@/app/config/churnSheet';
import type { ChurnExampleField } from '@/app/config/churnExamples';
import type { ClientRecord } from '@/app/types/client';
import { CHURN_REASONS } from '@/app/types/client';

export type ChurnFormValues = {
  churnedAt: string;
  feeAmount: string;
  dataCleanup: string;
  churnType: string;
  earlySign: string;
  reason: string;
  detail: string;
};

type Props = {
  selectedClient: ClientRecord | null;
  onClientChange: (client: ClientRecord | null) => void;
  values: ChurnFormValues;
  onChange: (patch: Partial<ChurnFormValues>) => void;
  saving: boolean;
  onSubmit: () => void;
  backfillNote?: boolean;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function defaultChurnFormValues(): ChurnFormValues {
  return {
    churnedAt: todayInputValue(),
    feeAmount: '',
    dataCleanup: '',
    churnType: '',
    earlySign: '',
    reason: '',
    detail: '',
  };
}

export default function ChurnRegisterForm({
  selectedClient,
  onClientChange,
  values,
  onChange,
  saving,
  onSubmit,
  backfillNote,
}: Props) {
  const manager = selectedClient?.manager ?? '';

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-6 space-y-4 rounded-2xl border border-gray-100 bg-white overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-bold text-gray-500">수임처 선택</p>
        <div className="mt-2">
          <ChurnClientSearch value={selectedClient} onChange={onClientChange} disabled={saving} />
        </div>
        {backfillNote && selectedClient?.status === 'churned' && (
          <p className="mt-2 text-xs text-amber-700 font-medium">
            유출 상태이나 이력이 없는 수임처입니다. 아래 내용을 입력해 이력을 등록합니다.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm border-collapse">
          <thead>
            <tr className="bg-red-50 border-b border-red-100">
              {CHURN_COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`px-2 py-2 text-left text-[10px] font-bold text-red-800 whitespace-nowrap ${
                    col.sticky ? 'sticky left-0 z-10 bg-red-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ''
                  }`}
                  style={{ minWidth: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              {CHURN_COLUMNS.map(col => {
                const cellCls = `px-2 py-2 align-top ${
                  col.sticky ? 'sticky left-0 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ''
                }`;

                if (col.key === 'companyName') {
                  return (
                    <td key={col.key} className={cellCls}>
                      <span className="font-bold text-gray-900 block truncate max-w-[8rem]">
                        {selectedClient?.companyName ?? '—'}
                      </span>
                    </td>
                  );
                }

                if (col.key === 'manager') {
                  return (
                    <td key={col.key} className={cellCls}>
                      <span className="text-gray-700">{manager || '—'}</span>
                    </td>
                  );
                }

                if (col.key === 'churnedAt') {
                  return (
                    <td key={col.key} className={cellCls}>
                      <input
                        type="date"
                        value={values.churnedAt}
                        onChange={e => onChange({ churnedAt: e.target.value })}
                        disabled={!selectedClient || saving}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50"
                      />
                    </td>
                  );
                }

                if (col.key === 'feeAmount') {
                  return (
                    <td key={col.key} className={cellCls}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={values.feeAmount}
                        onChange={e => onChange({ feeAmount: e.target.value })}
                        disabled={!selectedClient || saving}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono disabled:opacity-50"
                      />
                    </td>
                  );
                }

                if (col.key === 'reason') {
                  return (
                    <td key={col.key} className={cellCls}>
                      <input
                        type="text"
                        list="churn-reason-suggestions"
                        value={values.reason}
                        onChange={e => onChange({ reason: e.target.value })}
                        disabled={!selectedClient || saving}
                        placeholder="유출 사유"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50"
                      />
                      <datalist id="churn-reason-suggestions">
                        {CHURN_REASONS.map(r => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </td>
                  );
                }

                const fieldKey = col.key as 'dataCleanup' | 'churnType' | 'earlySign';
                return (
                  <td key={col.key} className={cellCls}>
                    <input
                      type="text"
                      value={values[fieldKey]}
                      onChange={e => onChange({ [fieldKey]: e.target.value })}
                      disabled={!selectedClient || saving}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50"
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="px-4 pb-4">
        <label className="block">
          <span className="text-xs font-bold text-gray-500">상세 메모 (엑셀 외 보조)</span>
          <textarea
            value={values.detail}
            onChange={e => onChange({ detail: e.target.value })}
            disabled={!selectedClient || saving}
            rows={3}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>

        <div className="mt-3">
          <ChurnExamplesPanel
            disabled={!selectedClient || saving}
            onApply={(field: ChurnExampleField, text: string) => {
              onChange({ [field]: appendChurnFieldValue(values[field], text) });
            }}
          />
        </div>

        <button
          type="submit"
          disabled={saving || !selectedClient}
          className="mt-4 w-full py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? '등록 중…' : '유출 등록'}
        </button>
      </div>
    </form>
  );
}
