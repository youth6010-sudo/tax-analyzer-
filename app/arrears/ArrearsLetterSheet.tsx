import {
  formatArrearsPaidDateKo,
  formatArrearsWon,
  type ArrearsLetterLineDto,
} from '@/app/types/arrears';

export const ARREARS_LETTER_BANK_LINE = '부산은행 113-2016-5229-07 세무법인 청년들';
export const ARREARS_LETTER_ADDR_LINE = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호';
export const ARREARS_LETTER_TEL_LINE = 'TEL : 051-783-6007 / FAX : 051-784-6007';

type Props = {
  companyLabel: string;
  letterDateLabel: string;
  viewLines: ArrearsLetterLineDto[];
  /** 공문 표시용 내역 라벨 (viewLines 순서) */
  labels: string[];
  /** 행별 누적 잔액 */
  running: number[];
  /** 내역이 없을 때 화면에만 보이는 안내 */
  emptyHint?: string;
  className?: string;
};

/** 엑셀 「미수수수료 안내」 양식 공문 본문 — 미수 내역 화면·내용증명 2쪽 공용 */
export default function ArrearsLetterSheet({
  companyLabel,
  letterDateLabel,
  viewLines,
  labels,
  running,
  emptyHint,
  className = '',
}: Props) {
  const totalAmount = viewLines.reduce((s, l) => s + l.amount, 0);
  const totalPaid = viewLines.reduce((s, l) => s + l.paidAmount, 0);
  const feeBalance = running.length ? running[running.length - 1]! : 0;

  return (
    <article
      className={`arrears-letter mx-auto w-full max-w-[720px] rounded-xl border border-slate-200 bg-white px-8 py-10 text-black shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none ${className}`}
    >
      <div className="arrears-letter-brand flex flex-col items-center gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arrears-letter-header.png" alt="세무법인청년들" className="h-12 w-auto object-contain" />
        <p className="text-center text-[11px] tracking-wide text-slate-500">Youth tax Management Corporation</p>
      </div>

      <h2 className="mt-5 text-center text-[22px] font-bold tracking-wide text-slate-900 underline decoration-2 underline-offset-4">
        미수 수수료 안내
      </h2>

      <div className="mt-7 flex items-start justify-between gap-4 text-[13px] text-slate-900">
        <div className="space-y-1">
          <p>
            <span className="inline-block tracking-[0.35em]">수 신</span>
            <span className="font-semibold"> : {companyLabel}</span>
          </p>
          <p>
            <span className="inline-block tracking-[0.35em]">제 목</span>
            <span> : 미수수수료 안내</span>
          </p>
        </div>
        <p className="shrink-0 text-slate-800">{letterDateLabel || '—'}</p>
      </div>

      <div className="mt-6 space-y-1.5 text-[13px] leading-relaxed text-slate-900">
        <p>귀사의 무궁한 발전을 기원합니다.</p>
        <p>다음과 같이 미수수수료를 안내하여 드리오니 빠른 시일내에 결제 부탁드립니다.</p>
      </div>

      <p className="mt-6 text-center text-[13px] font-semibold tracking-[0.4em] text-slate-900">- 다 음 -</p>

      <p className="mt-5 text-[13px] font-semibold text-slate-900">1. 미수 수수료 안내</p>
      {viewLines.length === 0 ? (
        emptyHint ? <p className="mt-4 text-sm text-slate-500 print:hidden">{emptyHint}</p> : null
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="arrears-letter-table w-full table-fixed border-collapse text-[12px]">
            <colgroup>
              <col className="arrears-letter-col-desc" />
              <col className="arrears-letter-col-amt" />
              <col className="arrears-letter-col-amt" />
              <col className="arrears-letter-col-date" />
              <col className="arrears-letter-col-amt" />
            </colgroup>
            <thead>
              <tr className="bg-[#ececec]">
                <th className="border border-[#222] px-2 py-1.5 text-center font-semibold">내역</th>
                <th className="border border-[#222] px-1.5 py-1.5 text-center font-semibold whitespace-nowrap">
                  금액(vat 포함)
                </th>
                <th className="border border-[#222] px-1.5 py-1.5 text-center font-semibold whitespace-nowrap">
                  지급내역
                </th>
                <th className="border border-[#222] px-1.5 py-1.5 text-center font-semibold whitespace-nowrap">
                  지급일시
                </th>
                <th className="border border-[#222] px-1.5 py-1.5 text-center font-semibold whitespace-nowrap">
                  잔액
                </th>
              </tr>
            </thead>
            <tbody>
              {viewLines.map((l, i) => (
                <tr key={l.id}>
                  <td className="border border-[#222] px-2 py-1 text-slate-900">{labels[i] || l.description}</td>
                  <td className="border border-[#222] px-2 py-1 text-right text-slate-900">
                    {l.amount ? formatArrearsWon(l.amount) : ''}
                  </td>
                  <td className="border border-[#222] px-2 py-1 text-right text-slate-900">
                    {l.paidAmount ? formatArrearsWon(l.paidAmount) : ''}
                  </td>
                  <td className="border border-[#222] px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                    {formatArrearsPaidDateKo(l.paidDate) || ''}
                  </td>
                  <td className="border border-[#222] px-2 py-1 text-right text-slate-900">
                    {formatArrearsWon(running[i] ?? 0)}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#ececec] font-semibold">
                <td className="border border-[#222] px-2 py-1.5 text-center">총액</td>
                <td className="border border-[#222] px-2 py-1.5 text-right">{formatArrearsWon(totalAmount)}</td>
                <td className="border border-[#222] px-2 py-1.5 text-right">{formatArrearsWon(totalPaid)}</td>
                <td className="border border-[#222] px-2 py-1.5" />
                <td className="border border-[#222] px-2 py-1.5 text-right">{formatArrearsWon(feeBalance)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="border border-[#222] bg-[#d9d9d9] px-2 py-1.5 text-center" colSpan={4}>
                  미수 수수료
                </td>
                <td className="border border-[#222] bg-[#d9d9d9] px-2 py-1.5 text-right text-slate-900">
                  {formatArrearsWon(feeBalance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-7 text-[13px] font-semibold text-slate-900">2. 입금 계좌 번호</p>
      <p className="mt-1.5 text-[13px] text-slate-900">{ARREARS_LETTER_BANK_LINE}</p>

      <div className="arrears-letter-footer mt-14 flex items-end gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arrears-letter-footer.png" alt="세무법인청년들" className="h-10 w-auto shrink-0 object-contain" />
        <div className="min-w-0 space-y-0.5 text-[11px] leading-snug text-slate-600">
          <p>{ARREARS_LETTER_ADDR_LINE}</p>
          <p>{ARREARS_LETTER_TEL_LINE}</p>
        </div>
      </div>

      <style>{`
        .arrears-letter,
        .arrears-letter * {
          font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif !important;
        }
        .arrears-letter-table { table-layout: fixed; width: 100%; }
        .arrears-letter-table th,
        .arrears-letter-table td { vertical-align: middle; }
        .arrears-letter-col-desc { width: 28%; }
        .arrears-letter-col-amt { width: 18%; }
        .arrears-letter-col-date { width: 18%; }
        .arrears-letter-table td:first-child { word-break: keep-all; overflow-wrap: anywhere; }
        .arrears-letter-table th:not(:first-child),
        .arrears-letter-table td:not(:first-child) { overflow: hidden; }
      `}</style>
    </article>
  );
}
