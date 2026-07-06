import { useEffect, useRef, useState } from 'react';

import type { PaymentNotice } from '../_lib/types';
import {
  defaultWithholdingItems,
  ensureWithholdingItems,
  usesWithholdingBreakdown,
  WITHHOLDING_ITEM_LABELS,
} from '../_lib/withholdingItems';
import { noticeInput, noticeLabel, noticeSection, noticeSectionTitle } from './noticeUi';

const inputClass = `${noticeInput} w-full min-w-0 max-w-full box-border`;

// 천 단위 콤마 표시 (0이면 빈 문자열, 음수는 '-' 유지 = 환급)
function formatComma(n: number): string {
  return n !== 0 ? n.toLocaleString('ko-KR') : '';
}

// 금액 입력 — '-'를 먼저 입력해도 유지(환급), 천 단위 콤마 자동.
// 숫자 값(0)으로 인해 '-'가 사라지지 않도록 입력 중에는 로컬 텍스트를 유지한다.
function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => formatComma(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(formatComma(value));
  }, [value]);

  const handle = (raw: string) => {
    const neg = raw.includes('-');
    const digits = raw.replace(/[^\d]/g, '');
    const grouped = digits ? Number(digits).toLocaleString('ko-KR') : '';
    setText((neg ? '-' : '') + grouped);
    const n = digits ? Number(digits) : 0;
    onChange(neg ? -n : n);
  };

  return (
    <input
      type="text"
      inputMode="text"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(formatComma(value));
      }}
      onChange={e => handle(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

// "2026-07-27"(ISO) → "2026.07.27"
function isoToDotted(iso: string): string {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${y}.${m}.${d}` : '';
}

// 숫자만 추출해 "2026.07.27" 형태로 표시용 문자열 구성
function formatDateDigits(digits: string): string {
  const v = digits.slice(0, 8);
  return [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8)].filter(Boolean).join('.');
}

type Props = {
  value: PaymentNotice;
  onChange: (next: PaymentNotice) => void;
  taxTypeName: string;
  hasLocalTax: boolean;
  isWithholding: boolean;
  // 부가세: 납부서 장수만큼 회차별 날짜·금액 입력
  showInstallments: boolean;
  /** 부가세 신고결과보고 금액 연동 중 */
  vatAmountLinked?: boolean;
  /** 납부금액 수동 입력 시 (연동 해제) */
  onManualAmountEdit?: () => void;
  /** 부가세 신고결과보고 금액 다시 연동 */
  onReLinkVatAmount?: () => void;
  /** 수임처 연결 시 첨부 서류 문구가 세목별로 저장됨 */
  clientLinked?: boolean;
  embedded?: boolean;
};

export default function PaymentNoticeField({
  value,
  onChange,
  taxTypeName,
  hasLocalTax,
  isWithholding,
  showInstallments,
  vatAmountLinked = false,
  onManualAmountEdit,
  onReLinkVatAmount,
  clientLinked = false,
  embedded = false,
}: Props) {
  const update = (patch: Partial<PaymentNotice>) => onChange({ ...value, ...patch });

  const handleSlipsChange = (raw: number) => {
    const slips = Math.max(0, raw || 0);
    const patch: Partial<PaymentNotice> = { slips };
    if (isWithholding && usesWithholdingBreakdown(slips) && !value.withholdingItems?.length) {
      patch.withholdingItems = defaultWithholdingItems();
    }
    update(patch);
  };

  const patchAmount = (patch: Partial<PaymentNotice>) => {
    if (onManualAmountEdit) onManualAmountEdit();
    update(patch);
  };

  const useInstallments = showInstallments && value.slips >= 2;
  const useWhBreakdown = isWithholding && usesWithholdingBreakdown(value.slips);
  const whItems = ensureWithholdingItems(value.withholdingItems);

  const local = hasLocalTax ? value.localAmount : 0;
  const amounts = useWhBreakdown
    ? [...whItems.filter(i => i.enabled).map(i => i.amount), local]
    : useInstallments
      ? value.installments.map(i => i.amount)
      : [value.amount, local];
  const payTotal = amounts.filter(n => n > 0).reduce((s, n) => s + n, 0);
  const refundTotal = amounts.filter(n => n < 0).reduce((s, n) => s + Math.abs(n), 0);
  const hasRefund = refundTotal > 0;

  // 분납 회차 날짜 입력은 자유 타이핑을 위해 로컬 텍스트 상태로 관리
  const [dateTexts, setDateTexts] = useState<string[]>([]);
  useEffect(() => {
    setDateTexts(value.installments.map(it => isoToDotted(it.date)));
  }, [value.installments]);

  const updateInstallment = (i: number, patch: Partial<{ date: string; amount: number }>, manual = false) => {
    if (manual) onManualAmountEdit?.();
    const next = value.installments.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    update({ installments: next });
  };

  const handleInstDate = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setDateTexts(texts => texts.map((t, idx) => (idx === i ? formatDateDigits(digits) : t)));
    if (digits.length === 8) {
      updateInstallment(i, {
        date: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
      });
    } else if (digits.length === 0) {
      updateInstallment(i, { date: '' });
    }
  };

  const body = (
    <>
      <div className={`flex flex-wrap items-center ${embedded ? 'justify-end' : 'justify-between'} gap-2`}>
        {!embedded && <h2 className={noticeSectionTitle}>신고 결과 안내 (납부세액)</h2>}
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
          납부서
          <input
            type="number"
            min={0}
            value={value.slips || ''}
            onChange={e => handleSlipsChange(Number(e.target.value) || 0)}
            placeholder="0"
            className={`${noticeInput} w-14 !py-1.5 text-center text-xs`}
          />
          장
        </label>
      </div>

      <label className="mt-3 block min-w-0">
        <span className={`${noticeLabel} mb-1 block`}>첨부 서류</span>
        <div className="flex min-w-0 items-center gap-1">
          <input
            type="text"
            value={value.attachNote}
            onChange={e => update({ attachNote: e.target.value })}
            placeholder="예) 6월 급여대장 및 급여명세서"
            className={`${inputClass} min-w-0 flex-1`}
          />
          {value.slips > 0 && (
            <span className="shrink-0 text-sm text-slate-600">, 납부서 {value.slips}장</span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          납부서 장수는 위 납부서 입력값에 따라 자동으로 붙습니다.
          {clientLinked && (
            <span className="text-slate-500">
              {' '}
              수임처 연결 시 이 문구는 세목별로 저장되며, 수정 후 위 「수임처에 저장」을 눌러 주세요.
            </span>
          )}
        </p>
      </label>

      {vatAmountLinked && (
        <p className="mt-2 text-[11px] font-medium text-blue-600">
          신고 결과 보고 최종세액과 연동 중입니다. 직접 수정하면 수동 입력으로 전환됩니다.
        </p>
      )}
      {!vatAmountLinked && onReLinkVatAmount && showInstallments && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-slate-500">수동 입력 중</span>
          <button
            type="button"
            onClick={onReLinkVatAmount}
            className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            신고결과 다시 연동
          </button>
        </div>
      )}

      {!useInstallments && !useWhBreakdown && (
        <div
          className={`mt-3 grid min-w-0 gap-3 ${
            hasLocalTax ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          <div className="min-w-0">
            <label className={`${noticeLabel} mb-1 block`}>
              {hasLocalTax ? `${taxTypeName} 납부금액` : '납부금액'}
            </label>
            <div className="relative min-w-0">
              <MoneyInput
                value={value.amount}
                onChange={n => patchAmount({ amount: n })}
                placeholder="예) 1,250,000"
                className={`${inputClass} pr-8`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                원
              </span>
            </div>
          </div>

          {hasLocalTax && (
            <div className="min-w-0">
              <label className={`${noticeLabel} mb-1 block`}>지방소득세</label>
              <div className="relative min-w-0">
                <MoneyInput
                  value={value.localAmount}
                  onChange={n => update({ localAmount: n })}
                  placeholder="예) 125,000"
                  className={`${inputClass} pr-8`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  원
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {useWhBreakdown && (
        <div className="mt-3 min-w-0 space-y-3">
          <div>
            <p className={`${noticeLabel} mb-1.5`}>원천세 항목</p>
            <p className="mb-2 text-[11px] text-slate-400">
              납부서에 해당하는 항목만 선택하세요. 지방소득세는 아래에 별도 입력합니다.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {whItems.map(item => {
                const label = WITHHOLDING_ITEM_LABELS[item.key];
                const active = item.enabled;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      const next = whItems.map(row =>
                        row.key === item.key ? { ...row, enabled: !row.enabled } : row,
                      );
                      update({ withholdingItems: next });
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {whItems.some(i => i.enabled) && (
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {whItems
                .filter(i => i.enabled)
                .map(item => (
                  <div key={item.key} className="min-w-0">
                    <label className={`${noticeLabel} mb-1 block`}>
                      {WITHHOLDING_ITEM_LABELS[item.key]}
                    </label>
                    <div className="relative min-w-0">
                      <MoneyInput
                        value={item.amount}
                        onChange={n => {
                          const next = whItems.map(row =>
                            row.key === item.key ? { ...row, amount: n } : row,
                          );
                          update({ withholdingItems: next });
                        }}
                        placeholder="금액"
                        className={`${inputClass} pr-8`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        원
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {hasLocalTax && (
            <div className="min-w-0 max-w-md">
              <label className={`${noticeLabel} mb-1 block`}>지방소득세</label>
              <div className="relative min-w-0">
                <MoneyInput
                  value={value.localAmount}
                  onChange={n => update({ localAmount: n })}
                  placeholder="예) 125,000"
                  className={`${inputClass} pr-8`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  원
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {useInstallments && (
        <div className="mt-3 min-w-0 space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            분납 일정{' '}
            <span className="font-normal text-slate-400">· 권장 일자 자동 입력</span>
          </p>
          {value.installments.map((it, i) => (
            <div
              key={i}
              className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
            >
              <span className="text-xs font-medium text-slate-500">{i + 1}차</span>
              <input
                type="text"
                inputMode="numeric"
                value={dateTexts[i] ?? ''}
                onChange={e => handleInstDate(i, e.target.value)}
                placeholder="2026.07.27"
                maxLength={10}
                className={inputClass}
              />
              <div className="relative min-w-0">
                <MoneyInput
                  value={it.amount}
                  onChange={n => updateInstallment(i, { amount: n }, true)}
                  placeholder="금액"
                  className={`${inputClass} pr-7`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  원
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {isWithholding && hasRefund && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <input
            type="checkbox"
            checked={value.refundClaimed}
            onChange={e => update({ refundClaimed: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
          />
          <span className="text-xs leading-relaxed text-slate-600">
            <span className="font-bold text-slate-800">환급 신청</span>
            <br />
            체크 시 <b>1개월 이내 환급</b>, 미체크 시 <b>다음 급여(원천세) 신고 시 차감</b> 문구로
            생성됩니다.
          </span>
        </label>
      )}

      <div className="mt-2 space-y-0.5 text-[11px] text-slate-400">
        {payTotal > 0 && (
          <p>
            최종 납부 세액: 총{' '}
            <b className="text-slate-600">{payTotal.toLocaleString('ko-KR')} 원</b>
          </p>
        )}
        {refundTotal > 0 && (
          <p>
            최종 환급 세액: 총{' '}
            <b className="text-emerald-600">{refundTotal.toLocaleString('ko-KR')} 원</b>
          </p>
        )}
        {!useInstallments && !useWhBreakdown && <p>환급은 금액 앞에 &lsquo;-&rsquo;를 붙여 입력하세요. (예: -500,000)</p>}
        {useWhBreakdown && <p>선택한 항목만 안내문 납부 내역에 표시됩니다. 환급은 금액 앞에 &lsquo;-&rsquo;를 붙이세요.</p>}
      </div>
    </>
  );

  if (embedded) return <div className="min-w-0 overflow-hidden">{body}</div>;
  return <section className={`${noticeSection} min-w-0 overflow-hidden`}>{body}</section>;
}
