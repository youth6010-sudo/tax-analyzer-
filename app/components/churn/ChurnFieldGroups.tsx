'use client';

import { useEffect, useState } from 'react';
import {
  CHURN_TYPE_OPTIONS,
  DATA_CLEANUP_OPTIONS,
  EARLY_SIGN_ITEMS,
  REASON_ITEMS,
  isNumberedItemChecked,
  joinCheckboxValue,
  parseCheckboxValue,
  toggleNumberedItem,
} from '@/app/config/churnOptions';

type StaffUser = { name: string };

export function ChurnCheckboxGroup({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const selected = parseCheckboxValue(value, options);
  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt];
    onChange(joinCheckboxValue(next));
  };

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-1 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              disabled={disabled}
              onChange={() => toggle(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ChurnNumberedField({
  label,
  items,
  value,
  onChange,
  disabled,
}: {
  label: string;
  items: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block">
        <span className="text-[10px] font-bold text-gray-500">{label}</span>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50"
        />
      </label>
      <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-1">
        <p className="text-[9px] font-bold text-gray-400">입력 예시 (체크 시 위 칸에 반영)</p>
        {items.map((text, i) => (
          <label key={i} className="flex items-start gap-2 text-[10px] text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={isNumberedItemChecked(value, i)}
              disabled={disabled}
              onChange={() => onChange(toggleNumberedItem(value, items, i))}
            />
            <span>
              <span className="font-bold text-gray-500">{i + 1}. </span>
              {text}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function ChurnManagerSelect({
  value,
  onChange,
  disabled,
  defaultManager,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  defaultManager?: string;
}) {
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => {
    void fetch('/api/auth/login-users')
      .then(r => r.json())
      .then(d => setStaff(d.users ?? []))
      .catch(() => setStaff([]));
  }, []);

  useEffect(() => {
    if (!value && defaultManager) onChange(defaultManager);
  }, [defaultManager, value, onChange]);

  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 mb-1">담당</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {staff.map(u => (
          <label key={u.name} className="flex items-center gap-1 text-[11px] text-gray-700">
            <input
              type="radio"
              name="churn-manager"
              checked={value === u.name}
              disabled={disabled}
              onChange={() => onChange(u.name)}
            />
            {u.name}
          </label>
        ))}
        {!staff.length && (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            placeholder={defaultManager || '담당자'}
            className="text-xs border border-gray-200 rounded px-2 py-1"
          />
        )}
      </div>
    </div>
  );
}
