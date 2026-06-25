import type { VatReport } from '../_lib/types';
import { calcVatReport } from '../_lib/templates';

const inputClass =
  'w-full rounded-xl border border-blue-100 bg-white/70 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100';

function formatComma(n: number): string {
  return n !== 0 ? n.toLocaleString('ko-KR') : '';
}

function parseComma(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

type Props = {
  value: VatReport;
  onChange: (next: VatReport) => void;
};

export default function VatReportField({ value, onChange }: Props) {
  const update = (patch: Partial<VatReport>) => onChange({ ...value, ...patch });
  const { buySupply, buyVat, finalTax } = calcVatReport(value);
  const isPay = finalTax >= 0;

  // 공급가/부가세 한 쌍 입력 행
  const pair = (
    label: string,
    supplyKey: keyof VatReport,
    vatKey: keyof VatReport,
  ) => (
    <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatComma(value[supplyKey] as number)}
        onChange={e => update({ [supplyKey]: parseComma(e.target.value) } as Partial<VatReport>)}
        placeholder="공급가"
        className={inputClass}
      />
      <input
        type="text"
        inputMode="numeric"
        value={formatComma(value[vatKey] as number)}
        onChange={e => update({ [vatKey]: parseComma(e.target.value) } as Partial<VatReport>)}
        placeholder="부가세"
        className={inputClass}
      />
    </div>
  );

  return (
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(96,165,250,0.35)] backdrop-blur-sm sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-sky-200 text-sm">
          🔎
        </span>
        신고 결과 보고 및 검토 (부가세)
      </h2>

      <div className="mt-3 space-y-3">
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-[11px] font-semibold text-slate-400">
            <span />
            <span className="pl-1">공급가</span>
            <span className="pl-1">부가세</span>
          </div>
          {pair('매출', 'salesSupply', 'salesVat')}
        </div>

        <div className="rounded-2xl border border-blue-50 bg-blue-50/40 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">매입 (3종 자동 합산)</p>
          <div className="space-y-2">
            {pair('세금계산서', 'taxInvoiceSupply', 'taxInvoiceVat')}
            {pair('고정자산 취득', 'fixedAssetSupply', 'fixedAssetVat')}
            {pair('카드/현금영수증', 'cardCashSupply', 'cardCashVat')}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            매입 합계 — 공급가{' '}
            <b className="text-slate-700">{buySupply.toLocaleString('ko-KR')}</b> 원 · 부가세{' '}
            <b className="text-slate-700">{buyVat.toLocaleString('ko-KR')}</b> 원
          </p>
        </div>

        <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
          <span className="text-xs text-slate-500">경감세액</span>
          <input
            type="text"
            value={value.reductionLabel}
            onChange={e => update({ reductionLabel: e.target.value })}
            placeholder="명칭 (예: 전자신고)"
            className={inputClass}
          />
          <input
            type="text"
            inputMode="numeric"
            value={formatComma(value.reductionAmount)}
            onChange={e => update({ reductionAmount: parseComma(e.target.value) })}
            placeholder="금액"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        최종 세액:{' '}
        <b className={isPay ? 'text-rose-600' : 'text-emerald-600'}>
          {Math.abs(finalTax).toLocaleString('ko-KR')} 원
        </b>{' '}
        ({isPay ? '납부' : '환급'})
        <span className="ml-1 text-slate-400">= 매출세액 − 매입세액 − 경감세액</span>
      </div>
    </section>
  );
}
