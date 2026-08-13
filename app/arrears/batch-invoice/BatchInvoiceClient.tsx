'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalMain,
} from '@/app/components/portal/uiClasses';
import { formatArrearsWon } from '@/app/types/arrears';
import { fmt } from '@/app/lib/taxAmountFmt';
import {
  ARREARS_LETTER_ADDR,
  ARREARS_LETTER_BANK,
  ARREARS_LETTER_TEL,
} from '@/lib/arrearsLetterExport';

type Row = {
  entryId: string;
  companyName: string;
  externalCode: string;
  managerName: string;
  amount: number;
  remark: string;
  reasonSummary: string;
};

function formatSubmitDateKo(d = new Date()): string {
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
}

export default function BatchInvoiceClient() {
  const sp = useSearchParams();
  const idsParam = sp.get('ids') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [submitDate, setSubmitDate] = useState(formatSubmitDateKo);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!idsParam.trim()) {
      setError('선택된 업체가 없습니다. 미수관리에서 체크한 뒤 열어 주세요.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/arrears/batch-invoice?ids=${encodeURIComponent(idsParam)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '불러오기 실패');
      const list = ((data as { rows: Row[] }).rows || []) as Row[];
      setRows(list);
      const rMap: Record<string, string> = {};
      const aMap: Record<string, string> = {};
      for (const r of list) {
        rMap[r.entryId] = r.remark;
        aMap[r.entryId] = formatArrearsWon(r.amount);
      }
      setRemarks(rMap);
      setAmounts(aMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [idsParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(
    () =>
      rows.map(r => ({
        ...r,
        remark: remarks[r.entryId] ?? r.remark,
        amount: Math.round(Number(String(amounts[r.entryId] ?? r.amount).replace(/,/g, '')) || 0),
      })),
    [rows, remarks, amounts],
  );

  const total = displayRows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className={`${portalMain} w-full space-y-4 py-4`}>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/arrears" className="text-sm text-blue-800 underline-offset-2 hover:underline">
            ← 미수관리
          </Link>
          <h1 className="mt-1 text-lg font-bold text-slate-900">일괄 미수 수수료 안내</h1>
          <p className="text-xs text-slate-500">비고·금액을 고친 뒤 인쇄하세요. 화면과 같은 양식으로 나옵니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            제출일
            <input
              className={`${portalInput} py-1.5 text-sm`}
              value={submitDate}
              onChange={e => setSubmitDate(e.target.value)}
            />
          </label>
          <button type="button" className={portalBtnSecondary} onClick={() => void load()}>
            다시 불러오기
          </button>
          <button type="button" className={portalBtnPrimary} onClick={() => window.print()}>
            인쇄
          </button>
        </div>
      </div>

      {error ? <p className="no-print text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="no-print text-sm text-slate-500">불러오는 중…</p> : null}

      {!loading && displayRows.length > 0 ? (
        <article className="batch-invoice mx-auto w-full max-w-[840px] bg-white px-8 py-10 text-[#222] shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[17px] font-bold text-[#5b2d8e]">세무법인청년들 부산지점</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                {ARREARS_LETTER_ADDR}
                <br />
                {ARREARS_LETTER_TEL.replace(/^TEL\s*:\s*/i, 'T. ').replace(/\s*\/\s*FAX\s*:\s*/i, '  F. ')}
              </p>
            </div>
            <div className="text-right">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/arrears-letter-header.png"
                alt=""
                className="ml-auto h-10 w-auto object-contain opacity-90"
              />
            </div>
          </header>

          <h2 className="mt-8 text-center text-[26px] font-bold tracking-wide text-[#1e3a6e] print:mt-6 print:text-[22px]">
            미수 수수료 안내
          </h2>
          <p className="mt-2 text-center text-[14px] font-bold text-[#c2185b] print:text-[13px]">
            제출일: {submitDate}
          </p>

          <div className="mt-8 overflow-x-auto print:mt-6">
            <table className="w-full border-collapse text-[13px] print:text-[12px]">
              <thead>
                <tr className="border-y-2 border-[#1e3a6e] bg-[#f3f5f9]">
                  <th className="px-3 py-2.5 text-left font-semibold text-[#1e3a6e]">내역</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-[#1e3a6e]">비고</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[#1e3a6e] whitespace-nowrap">
                    총액
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => (
                  <tr
                    key={r.entryId}
                    className={`border-b border-slate-200 ${i % 2 === 1 ? 'bg-[#f7f7f8]' : 'bg-white'}`}
                  >
                    <td className="px-3 py-2.5 align-top font-medium text-slate-900">
                      {r.companyName}
                      <span className="no-print mt-0.5 block font-mono text-[10px] font-normal text-slate-400">
                        {r.externalCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      <span className="print:hidden">
                        <input
                          className={`${portalInput} w-full min-w-[12rem] py-1 text-xs`}
                          value={remarks[r.entryId] ?? ''}
                          onChange={e =>
                            setRemarks(prev => ({ ...prev, [r.entryId]: e.target.value }))
                          }
                        />
                      </span>
                      <span className="hidden print:inline">{r.remark}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums text-slate-900 whitespace-nowrap">
                      <span className="print:hidden">
                        <input
                          className={`${portalInput} w-[7.5rem] py-1 text-right text-xs tabular-nums`}
                          value={amounts[r.entryId] ?? ''}
                          inputMode="numeric"
                          onChange={e =>
                            setAmounts(prev => ({ ...prev, [r.entryId]: fmt(e.target.value) }))
                          }
                        />
                      </span>
                      <span className="hidden print:inline">{formatArrearsWon(r.amount)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-6 print:mt-6">
            <div className="max-w-md text-[12px] leading-relaxed text-slate-700 print:text-[11px]">
              <p className="font-semibold text-slate-900">
                입금 계좌 번호 : {ARREARS_LETTER_BANK}
              </p>
              <p className="mt-1.5">카드사진만 보내주시면 카드결제도 가능합니다.</p>
            </div>
            <div className="text-right">
              <p className="text-[13px] font-semibold text-[#1e3a6e]">합계</p>
              <p className="mt-0.5 text-[28px] font-bold tabular-nums text-[#c2185b] print:text-[24px]">
                ₩{formatArrearsWon(total)}
              </p>
            </div>
          </div>
        </article>
      ) : null}

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          .batch-invoice, .batch-invoice * { visibility: visible; }
          .batch-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
