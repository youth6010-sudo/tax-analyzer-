'use client';

import ChurnClientSearch from '@/app/components/churn/ChurnClientSearch';
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
import type { ClientRecord } from '@/app/types/client';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';

export type ChurnFormValues = {
  churnedAt: string;
  feeAmount: string;
  dataCleanup: string;
  churnType: string;
  earlySign: string;
  reason: string;
  detail: string;
  manager: string;
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
    manager: '',
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
        {selectedClient && (
          <p className="mt-2 text-sm font-bold text-gray-900">{selectedClient.companyName}</p>
        )}
        {backfillNote && selectedClient?.status === 'churned' && (
          <p className="mt-2 text-xs text-amber-700 font-medium">
            유출 상태이나 이력이 없는 수임처입니다. 아래 내용을 입력해 이력을 등록합니다.
          </p>
        )}
      </div>

      <div className="px-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-[10px] font-bold text-gray-500">계약 종료일</span>
            <input
              type="date"
              value={values.churnedAt}
              onChange={e => onChange({ churnedAt: e.target.value })}
              disabled={!selectedClient || saving}
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-gray-500">{CLIENT_FIELD_LABELS.fee}</span>
            <input
              type="text"
              inputMode="numeric"
              value={values.feeAmount}
              onChange={e => onChange({ feeAmount: e.target.value })}
              disabled={!selectedClient || saving}
              placeholder="0"
              className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono disabled:opacity-50"
            />
          </label>
        </div>

        <ChurnManagerSelect
          value={values.manager}
          onChange={v => onChange({ manager: v })}
          defaultManager={selectedClient?.manager}
          disabled={!selectedClient || saving}
        />

        <ChurnCheckboxGroup
          label="자료 정리"
          options={DATA_CLEANUP_OPTIONS}
          value={values.dataCleanup}
          onChange={v => onChange({ dataCleanup: v })}
          disabled={!selectedClient || saving}
        />

        <ChurnCheckboxGroup
          label="유형"
          options={CHURN_TYPE_OPTIONS}
          value={values.churnType}
          onChange={v => onChange({ churnType: v })}
          disabled={!selectedClient || saving}
        />

        <ChurnNumberedField
          label="전조증상"
          items={EARLY_SIGN_ITEMS}
          value={values.earlySign}
          onChange={v => onChange({ earlySign: v })}
          disabled={!selectedClient || saving}
        />

        <ChurnNumberedField
          label="유출 사유"
          items={REASON_ITEMS}
          value={values.reason}
          onChange={v => onChange({ reason: v })}
          disabled={!selectedClient || saving}
        />

        <label className="block">
          <span className="text-[10px] font-bold text-gray-500">상세 메모 (엑셀 외 보조)</span>
          <textarea
            value={values.detail}
            onChange={e => onChange({ detail: e.target.value })}
            disabled={!selectedClient || saving}
            rows={3}
            className="mt-0.5 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>

        <button
          type="submit"
          disabled={saving || !selectedClient}
          className="w-full py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? '등록 중…' : '유출 등록'}
        </button>
      </div>
    </form>
  );
}
