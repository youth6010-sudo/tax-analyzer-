import { useEffect, useState } from 'react';

import type { MaterialDeadline } from '../_lib/types';
import {
  noticeInput,
  noticeLabel,
  noticeSection,
  noticeSectionTitle,
} from './noticeUi';

const fieldClass = `${noticeInput} w-full min-w-0 max-w-full box-border`;

const HOURS = Array.from({ length: 10 }, (_, i) => i + 9);
const MINUTES = [0, 30];

function isoToDotted(iso: string): string {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${y}.${m}.${d}` : '';
}

function formatDigits(digits: string): string {
  const v = digits.slice(0, 8);
  return [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8)].filter(Boolean).join('.');
}

function digitsToIso(digits: string): string | null {
  if (digits.length !== 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

type Props = {
  value: MaterialDeadline;
  onChange: (next: MaterialDeadline) => void;
};

export default function MaterialDeadlineField({ value, onChange }: Props) {
  const update = (patch: Partial<MaterialDeadline>) => onChange({ ...value, ...patch });
  const [dateText, setDateText] = useState(() => isoToDotted(value.date));

  useEffect(() => {
    setDateText(isoToDotted(value.date));
  }, [value.date]);

  const handleDateText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setDateText(formatDigits(digits));
    const iso = digitsToIso(digits);
    if (iso) update({ date: iso });
  };

  return (
    <section className={`${noticeSection} min-w-0 overflow-hidden`}>
      <h2 className={noticeSectionTitle}>자료 제출 마감</h2>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] sm:items-end">
        <div className="min-w-0">
          <label className={`${noticeLabel} mb-1 block`}>날짜</label>
          <input
            type="text"
            inputMode="numeric"
            value={dateText}
            onChange={e => handleDateText(e.target.value)}
            placeholder="2026.07.27"
            maxLength={10}
            className={fieldClass}
          />
        </div>
        <div className="min-w-0">
          <label className={`${noticeLabel} mb-1 block`}>시</label>
          <select
            value={value.hour}
            onChange={e => update({ hour: Number(e.target.value) })}
            className={fieldClass}
          >
            {HOURS.map(h => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}시
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className={`${noticeLabel} mb-1 block`}>분</label>
          <select
            value={value.minute}
            onChange={e => update({ minute: Number(e.target.value) })}
            className={fieldClass}
          >
            {MINUTES.map(m => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}분
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
