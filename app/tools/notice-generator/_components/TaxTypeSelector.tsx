import { TAX_TYPE_LIST } from '../_lib/taxTypes';
import type { TaxTypeKey } from '../_lib/types';

// 세목별 귀여운 이모지 + 활성/비활성 파스텔 스타일
const STYLE: Record<TaxTypeKey, { emoji: string; active: string }> = {
  vat: {
    emoji: '🧾',
    active: 'bg-gradient-to-br from-sky-200 to-blue-200 text-blue-900 ring-2 ring-blue-300',
  },
  withholding: {
    emoji: '💸',
    active:
      'bg-gradient-to-br from-violet-200 to-purple-200 text-violet-900 ring-2 ring-violet-300',
  },
  corporate: {
    emoji: '🏦',
    active:
      'bg-gradient-to-br from-emerald-200 to-teal-200 text-emerald-900 ring-2 ring-emerald-300',
  },
  income: {
    emoji: '💰',
    active:
      'bg-gradient-to-br from-amber-200 to-orange-200 text-amber-900 ring-2 ring-amber-300',
  },
};

type Props = {
  selected: TaxTypeKey;
  onSelect: (key: TaxTypeKey) => void;
};

export default function TaxTypeSelector({ selected, onSelect }: Props) {
  return (
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(167,139,250,0.35)] backdrop-blur-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-blue-200 text-sm">
          🧮
        </span>
        세목 선택
      </h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {TAX_TYPE_LIST.map(tax => {
          const s = STYLE[tax.key];
          const isActive = selected === tax.key;
          return (
            <button
              key={tax.key}
              type="button"
              onClick={() => onSelect(tax.key)}
              className={[
                'flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition active:scale-95',
                isActive
                  ? `border-transparent shadow-md ${s.active}`
                  : 'border-rose-100 bg-white/60 text-slate-600 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-sm',
              ].join(' ')}
            >
              <span className="text-lg" aria-hidden>
                {s.emoji}
              </span>
              <span className="text-sm font-bold">{tax.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
