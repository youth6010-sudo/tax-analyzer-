import { useEffect, useState } from 'react';

import type { MaterialDeadline } from '../_lib/types';

const selectClass =
  'rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100';

const HOURS = Array.from({ length: 10 }, (_, i) => i + 9); // 09~18
const MINUTES = [0, 30];

// "2026-07-27"(ISO) → "2026.07.27"
function isoToDotted(iso: string): string {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${y}.${m}.${d}` : '';
}

// 숫자만 추출해 "2026.07.27" 형태로 표시용 문자열 구성
function formatDigits(digits: string): string {
  const v = digits.slice(0, 8);
  return [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8)].filter(Boolean).join('.');
}

// 8자리 숫자가 유효한 날짜면 "2026-07-27"(ISO) 반환, 아니면 null
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

  // 외부에서 날짜가 바뀌면(예: 신고 기한일 자동 채움) 입력칸 표시도 동기화
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
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(244,114,182,0.35)] backdrop-blur-sm sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-pink-200 text-sm">
          ⏰
        </span>
        자료 제출 마감
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={dateText}
          onChange={e => handleDateText(e.target.value)}
          placeholder="2026.07.27"
          maxLength={10}
          className={`${selectClass} w-32`}
        />
        <div className="flex items-center gap-1">
          <select
            value={value.hour}
            onChange={e => update({ hour: Number(e.target.value) })}
            className={selectClass}
          >
            {HOURS.map(h => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}시
              </option>
            ))}
          </select>
          <select
            value={value.minute}
            onChange={e => update({ minute: Number(e.target.value) })}
            className={selectClass}
          >
            {MINUTES.map(m => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}분
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        안내문에 &quot;자료 제출 마감&quot; 줄로 표시됩니다. (기본값: 신고 기한일 13:00)
      </p>
    </section>
  );
}
