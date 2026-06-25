import type { MaterialDeadline } from '../_lib/types';

const selectClass =
  'rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100';

const HOURS = Array.from({ length: 10 }, (_, i) => i + 9); // 09~18
const MINUTES = [0, 30];

type Props = {
  value: MaterialDeadline;
  onChange: (next: MaterialDeadline) => void;
};

export default function MaterialDeadlineField({ value, onChange }: Props) {
  const update = (patch: Partial<MaterialDeadline>) => onChange({ ...value, ...patch });

  return (
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(244,114,182,0.35)] backdrop-blur-sm sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-pink-200 text-sm">
            ⏰
          </span>
          자료 제출 마감
        </h2>

        <button
          type="button"
          role="switch"
          aria-checked={value.enabled}
          onClick={() => update({ enabled: !value.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            value.enabled ? 'bg-rose-400' : 'bg-slate-200'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
              value.enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {value.enabled ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={value.date}
            onChange={e => update({ date: e.target.value })}
            className={selectClass}
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
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          켜면 안내문에 &quot;자료 제출 마감&quot; 줄이 추가됩니다. (시간 09~18시)
        </p>
      )}
    </section>
  );
}
