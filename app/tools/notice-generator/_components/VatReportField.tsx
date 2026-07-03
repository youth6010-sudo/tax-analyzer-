import type { VatNonDeductibleItem, VatReport } from '../_lib/types';
import { calcVatReport } from '../_lib/templates';
import {
  noticeBtnSecondary,
  noticeInput,
  noticeLabel,
  noticeSection,
  noticeSectionTitle,
  noticeTextarea,
} from './noticeUi';

const inputClass = `${noticeInput} !py-1.5 text-xs w-full min-w-0 box-border`;

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
  embedded?: boolean;
};

export default function VatReportField({ value, onChange, embedded = false }: Props) {
  const update = (patch: Partial<VatReport>) => onChange({ ...value, ...patch });
  const calc = calcVatReport(value);
  const isPay = calc.finalTax >= 0;

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

  const items = value.nonDeductibleItems ?? [];

  const setNonDeductible = (next: VatNonDeductibleItem[]) => {
    update({ nonDeductibleItems: next });
  };

  const patchNonDeductible = (i: number, patch: Partial<VatNonDeductibleItem>) => {
    setNonDeductible(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const addNonDeductible = () => {
    setNonDeductible([...items, { reason: '', vat: 0 }]);
  };

  const removeNonDeductible = (i: number) => {
    setNonDeductible(items.filter((_, idx) => idx !== i));
  };

  const body = (
    <>
      {!embedded && <h2 className={noticeSectionTitle}>신고 결과 보고 (부가세)</h2>}

      <div className={embedded ? 'space-y-3' : 'mt-3 space-y-3'}>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-[11px] font-semibold text-slate-400">
            <span />
            <span className="pl-1">공급가</span>
            <span className="pl-1">부가세</span>
          </div>
          {pair('매출', 'salesSupply', 'salesVat')}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">매입 (3종 합산)</p>
          <div className="space-y-2">
            {pair('세금계산서', 'taxInvoiceSupply', 'taxInvoiceVat')}
            {pair('고정자산 취득', 'fixedAssetSupply', 'fixedAssetVat')}
            {pair('카드/현금영수증', 'cardCashSupply', 'cardCashVat')}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            매입 합계 — 공급가{' '}
            <b className="text-slate-700">{calc.buySupply.toLocaleString('ko-KR')}</b> 원 · 부가세{' '}
            <b className="text-slate-700">{calc.buyVat.toLocaleString('ko-KR')}</b> 원
            {calc.nonDeductibleVat > 0 && (
              <>
                {' '}
                · 공제{' '}
                <b className="text-slate-700">{calc.deductibleBuyVat.toLocaleString('ko-KR')}</b> 원
              </>
            )}
          </p>
        </div>

        <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-amber-900">매입세액 불공제</p>
            <button type="button" onClick={addNonDeductible} className={`${noticeBtnSecondary} !py-1 text-xs`}>
              + 항목 추가
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-[11px] text-slate-500">불공제 항목이 있으면 사유와 세액을 입력하세요.</p>
          ) : (
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
                  <input
                    type="text"
                    value={it.reason}
                    onChange={e => patchNonDeductible(i, { reason: e.target.value })}
                    placeholder="불공제 사유 (예: 접대비)"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatComma(it.vat)}
                    onChange={e => patchNonDeductible(i, { vat: parseComma(e.target.value) })}
                    placeholder="세액"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeNonDeductible(i)}
                    className={`${noticeBtnSecondary} !px-2 !py-1 text-xs`}
                    title="삭제"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
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

        <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
          <span className="text-xs text-slate-500">가산세</span>
          <input
            type="text"
            value={value.penaltyLabel}
            onChange={e => update({ penaltyLabel: e.target.value })}
            placeholder="명칭"
            className={inputClass}
          />
          <input
            type="text"
            inputMode="numeric"
            value={formatComma(value.penaltyAmount)}
            onChange={e => update({ penaltyAmount: parseComma(e.target.value) })}
            placeholder="금액"
            className={inputClass}
          />
        </div>

        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
          <div>
            <label className={noticeLabel}>직원 여부</label>
            <input
              type="text"
              value={value.employeeStatus}
              onChange={e => update({ employeeStatus: e.target.value })}
              placeholder="예) 있음 / 없음"
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label className={noticeLabel}>차량 관련 · 공제 차량</label>
            <input
              type="text"
              value={value.vehicleDeductible}
              onChange={e => update({ vehicleDeductible: e.target.value })}
              placeholder="해당 시 기재"
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label className={noticeLabel}>차량 관련 · 불공제 차량</label>
            <input
              type="text"
              value={value.vehicleNonDeductible}
              onChange={e => update({ vehicleNonDeductible: e.target.value })}
              placeholder="해당 시 기재"
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label className={noticeLabel}>종이 세금계산서</label>
            <input
              type="text"
              value={value.paperTaxInvoice}
              onChange={e => update({ paperTaxInvoice: e.target.value })}
              placeholder="해당 시 내용 기재"
              className={`${inputClass} mt-1`}
            />
          </div>
          {!isPay && (
            <div className="sm:col-span-2">
              <label className={noticeLabel}>환급 사유</label>
              <textarea
                value={value.refundReason}
                onChange={e => update({ refundReason: e.target.value })}
                rows={2}
                placeholder="환급 해당 시 사유 기재"
                className={`${noticeTextarea} mt-1 !text-xs`}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={noticeLabel}>특이사항</label>
            <textarea
              value={value.vatSpecialNotes}
              onChange={e => update({ vatSpecialNotes: e.target.value })}
              rows={2}
              placeholder="해당 시 내용 기재"
              className={`${noticeTextarea} mt-1 !text-xs`}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p>
          최종 세액:{' '}
          <b className={isPay ? 'text-rose-600' : 'text-emerald-600'}>
            {Math.abs(calc.finalTax).toLocaleString('ko-KR')} 원
          </b>{' '}
          ({isPay ? '납부' : '환급'})
          <span className="ml-1 text-slate-400">
            = 매출세액 − 공제매입세액 − 경감세액 + 가산세액
          </span>
        </p>
        {(calc.salesVatRate != null || calc.buyVatRateExFixed != null) && (
          <p className="text-slate-500">
            {calc.salesVatRate != null && (
              <span>
                매출 부가율 <b className="text-slate-700">{calc.salesVatRate.toFixed(1)}%</b>
              </span>
            )}
            {calc.salesVatRate != null && calc.buyVatRateExFixed != null && ' · '}
            {calc.buyVatRateExFixed != null && (
              <span>
                매입 부가율(고정자산 제외){' '}
                <b className="text-slate-700">{calc.buyVatRateExFixed.toFixed(1)}%</b>
              </span>
            )}
          </p>
        )}
      </div>
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <section className={noticeSection}>{body}</section>;
}
