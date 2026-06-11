'use client';

import { useState, useMemo, useEffect, type ChangeEvent, type CompositionEvent } from 'react';
import type { IndustryRate } from '../types';
import { fmt, toNum } from '../lib/taxAmountFmt';
import { findIndustryRate, formatKRW, formatPct } from '../utils/calculator';
import { LS_SIM, type SimPersist, type SimCustomExpensePersist } from '../utils/taxSessionStorage';

// ── 타입 ──────────────────────────────────────────────────
interface SimRow {
  id: string;
  code: string;
  revenue: string;
  targetPct: number;
}

interface ComputedSimRow extends SimRow {
  revNum: number;
  rate: IndustryRate | null;
  baseIncome: number;
  targetIncome: number;
  requiredExpense: number;
}

interface Props {
  allRates: Record<string, IndustryRate>;
  prevExpenseRatios: never[];
  prevRevenue: number;
  currYear?: string;
  printInputExpenseDetail: boolean;
  onPrintInputExpenseDetailChange: (v: boolean) => void;
  /** 인쇄·PDF·JPG: 시뮬레이션 블록을 새 페이지에서 시작 */
  printSimulationNewPage: boolean;
  onPrintSimulationNewPageChange: (v: boolean) => void;
  onSimSnapshot?: (s: SimPersist) => void;
  /** 과세연도 기준 총수입·경비 명세 블록 표시 (시뮬레이션 헤더 체크) */
  detailAnalysisNeeded?: boolean;
  onDetailAnalysisNeededChange?: (v: boolean) => void;
  /** 인쇄·PDF·JPG — 내용이 있을 때만 출력에 포함 */
  nyRemarks: string;
  onNyRemarksChange: (v: string) => void;
}

const TARGET_PCTS = [80, 90, 100, 110, 120] as const;

let _uid = 0;
const uid        = () => String(++_uid);
const makeSimRow = (): SimRow => ({ id: uid(), code: '', revenue: '', targetPct: 100 });

function bumpSimUidFromRowIds(ids: string[]) {
  for (const id of ids) {
    const n = parseInt(id, 10);
    if (!Number.isNaN(n)) _uid = Math.max(_uid, n);
  }
}

let _simExpUid = 0;
const nextSimExpUid = () => String(++_simExpUid);
function bumpSimExpUidFromIds(ids: string[]) {
  for (const id of ids) {
    const n = parseInt(id, 10);
    if (!Number.isNaN(n)) _simExpUid = Math.max(_simExpUid, n);
  }
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function SimulationSection({
  allRates,
  currYear,
  printInputExpenseDetail,
  onPrintInputExpenseDetailChange,
  printSimulationNewPage,
  onPrintSimulationNewPageChange,
  onSimSnapshot,
  detailAnalysisNeeded = false,
  onDetailAnalysisNeededChange,
  nyRemarks,
  onNyRemarksChange,
}: Props) {
  const [rows, setRows] = useState<SimRow[]>([makeSimRow()]);
  const [card,  setCard]  = useState('');
  const [tax,   setTax]   = useState('');
  const [loan,  setLoan]  = useState('');
  const [other, setOther] = useState('');
  const [customExpenses, setCustomExpenses] = useState<SimCustomExpensePersist[]>([]);
  const [persistReady, setPersistReady] = useState(false);

  // 시뮬레이션 입력 — 브라우저에서 복구
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_SIM) : null;
      if (raw) {
        const p = JSON.parse(raw) as SimPersist;
        if (Array.isArray(p.rows) && p.rows.length > 0) {
          bumpSimUidFromRowIds(p.rows.map(r => r.id));
          setRows(p.rows);
        }
        if (typeof p.card === 'string') setCard(p.card);
        if (typeof p.tax === 'string') setTax(p.tax);
        if (typeof p.loan === 'string') setLoan(p.loan);
        if (typeof p.other === 'string') setOther(p.other);
        if (Array.isArray(p.customExpenses)) {
          setCustomExpenses(p.customExpenses);
          bumpSimExpUidFromIds(p.customExpenses.map(x => x.id));
        }
      }
    } catch {
      /* */
    }
    setPersistReady(true);
  }, []);

  useEffect(() => {
    if (!persistReady || typeof window === 'undefined') return;
    const snap: SimPersist = { rows, card, tax, loan, other, customExpenses };
    onSimSnapshot?.(snap);
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(LS_SIM, JSON.stringify(snap));
      } catch {
        /* */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [persistReady, rows, card, tax, loan, other, customExpenses, onSimSnapshot]);

  const updateRow = (id: string, field: keyof SimRow, value: string | number) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (field === 'code')      return { ...r, code: String(value).replace(/[^0-9]/g, '').slice(0, 6) };
      if (field === 'revenue')   return { ...r, revenue: fmt(String(value)) };
      if (field === 'targetPct') {
        const raw = typeof value === 'number' ? String(value) : String(value).trim().replace(',', '.');
        const normalized = raw.startsWith('.') ? `0${raw}` : raw;
        const n = typeof value === 'number' ? value : parseFloat(normalized);
        if (!Number.isFinite(n)) return r;
        const clamped = Math.min(200, Math.max(0, n));
        return { ...r, targetPct: clamped };
      }
      return r;
    }));
  };

  const applyAllPct = (pct: number) => setRows(prev => prev.map(r => ({ ...r, targetPct: pct })));
  const addRow      = () => setRows(prev => [...prev, makeSimRow()]);
  const removeRow   = (id: string) => { if (rows.length > 1) setRows(prev => prev.filter(r => r.id !== id)); };

  const addCustomExpense = () => {
    setCustomExpenses(prev => [...prev, { id: nextSimExpUid(), label: '추가항목', amount: '' }]);
  };
  const updateCustomExpense = (id: string, patch: Partial<Pick<SimCustomExpensePersist, 'label' | 'amount'>>) => {
    setCustomExpenses(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
  };
  const removeCustomExpense = (id: string) => {
    setCustomExpenses(prev => prev.filter(x => x.id !== id));
  };

  const computed: ComputedSimRow[] = useMemo(() => rows.map(r => {
    const revNum        = toNum(r.revenue);
    const rate          = r.code.length === 6 ? findIndustryRate(r.code, allRates) : null;
    const simpleRate    = rate?.simpleRateGeneral ?? 0;
    const baseIncome    = rate && revNum > 0 ? Math.trunc(revNum * (1 - simpleRate / 100)) : 0;
    // 조정률 소수 반영: 절사만 쓰면 소액·저조정에서 목표소득·가이드가 0으로 떨어져 '-'로 보이는 문제 방지
    const targetIncome  = baseIncome > 0 ? Math.round(baseIncome * (Number(r.targetPct) / 100)) : 0;
    const requiredExpense = revNum > 0 ? Math.round(revNum - targetIncome) : 0;
    return { ...r, revNum, rate, baseIncome, targetIncome, requiredExpense };
  }), [rows, allRates]);

  const totalRev            = computed.reduce((s, r) => s + r.revNum, 0);
  const totalBaseIncome     = computed.reduce((s, r) => s + r.baseIncome, 0);
  const totalTargetIncome   = computed.reduce((s, r) => s + r.targetIncome, 0);
  const totalRequiredExpPct = computed.reduce((s, r) => s + r.requiredExpense, 0);
  const requiredExpense     = totalBaseIncome > 0 ? totalRequiredExpPct : null;

  const cardAmt      = toNum(card);
  const taxAmt       = toNum(tax);
  const loanAmt      = toNum(loan);
  const otherAmt     = toNum(other);
  const customAmtSum = useMemo(
    () => customExpenses.reduce((s, c) => s + toNum(c.amount), 0),
    [customExpenses],
  );
  const totalExpense = cardAmt + taxAmt + loanAmt + otherAmt + customAmtSum;
  const gap          = requiredExpense !== null ? totalExpense - requiredExpense : null;
  const allSamePct   = rows.every(r => r.targetPct === rows[0].targetPct);

  return (
    <div
      className={`space-y-4 simulation-section bg-blue-50/40 rounded-3xl border border-blue-100 p-5 shadow-sm${
        printSimulationNewPage ? ' simulation-print-new-page' : ''
      }`}
    >

      {/* ── 제목 | 특이사항 | 상세 분석 필요·인쇄 옵션 (한 줄) ── */}
      <div className="flex flex-nowrap items-center gap-2 sm:gap-3 w-full min-w-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-1.5 h-9 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full" />
          <h2 className="text-2xl font-black tracking-tight whitespace-nowrap analysis-screen-title">
            <mark className="bg-yellow-200 px-2 py-0.5 rounded inline-block">
              {currYear && <span className="text-blue-600">{currYear}년 </span>}
              <span className="text-gray-900">소득금액 시뮬레이션</span>
            </mark>
          </h2>
        </div>
        <div className="no-print flex items-center gap-1.5 min-w-0 flex-1 basis-0">
          <label htmlFor="ny-remarks-sim" className="text-[11px] font-bold text-blue-900 shrink-0 whitespace-nowrap">
            특이사항
          </label>
          <textarea
            id="ny-remarks-sim"
            rows={1}
            value={nyRemarks}
            onChange={e => onNyRemarksChange(e.target.value)}
            placeholder="기재 시 인쇄·PDF·JPG에만 함께 출력"
            className="min-w-[6rem] w-full min-h-9 max-h-9 py-1.5 text-xs border border-blue-200 rounded-lg px-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white leading-snug"
          />
        </div>
        <div className="flex flex-nowrap items-center gap-2 shrink-0 ml-auto">
          {onDetailAnalysisNeededChange && (
            <label className="no-print flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50/80 transition-colors whitespace-nowrap">
              <input
                type="checkbox"
                checked={detailAnalysisNeeded}
                onChange={e => onDetailAnalysisNeededChange(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded shrink-0"
              />
              <span className="text-xs font-bold text-indigo-800">상세 분석 필요</span>
            </label>
          )}
          <label className="no-print flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-xl border border-blue-200 bg-white hover:bg-blue-50/80 transition-colors whitespace-nowrap">
            <input
              type="checkbox"
              checked={printInputExpenseDetail}
              onChange={e => onPrintInputExpenseDetailChange(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded shrink-0"
            />
            <span className="text-xs font-bold text-blue-800">입력지출상세 인쇄에 포함</span>
          </label>
          <label className="no-print flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/80 transition-colors whitespace-nowrap">
            <input
              type="checkbox"
              checked={printSimulationNewPage}
              onChange={e => onPrintSimulationNewPageChange(e.target.checked)}
              className="w-4 h-4 accent-slate-600 rounded shrink-0"
            />
            <span className="text-xs font-bold text-slate-800">시뮬레이션 새 장에서 시작</span>
          </label>
        </div>
      </div>

      {/* ── 입력 테이블 ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">예상 업종코드 · 수입금액 · 조정률</h3>
            <p className="text-xs text-gray-500 mt-0.5 no-print">행별 조정률(%) 선택 → 목표 소득금액·필요경비 가이드 자동계산</p>
          </div>
          <button onClick={addRow}
            className="no-print flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            항목 추가
          </button>
        </div>

        {/* 전체 조정률 (화면 전용) */}
        <div className="no-print px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
          <span className="text-sm font-bold text-amber-700 shrink-0">전체 적용:</span>
          <div className="flex gap-1.5 flex-wrap">
            {TARGET_PCTS.map(pct => (
              <button key={pct} onClick={() => applyAllPct(pct)}
                className={`px-3 py-1 rounded-lg text-sm font-bold border transition-all ${
                  allSamePct && rows[0]?.targetPct === pct
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
                }`}>
                {pct}%
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500 ml-1">또는 행별 개별 선택</span>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs font-bold">
                <th className="text-left px-2 py-2 w-6">#</th>
                <th className="text-left px-2 py-2">업종코드</th>
                <th className="text-right px-2 py-2">예상 수입금액</th>
                <th className="text-center px-2 py-2 text-amber-700 no-print">조정률</th>
                <th className="text-right px-2 py-2 text-gray-600">단순기준 소득금액</th>
                <th className="text-right px-2 py-2 text-blue-700">목표 소득금액</th>
                <th className="text-right px-2 py-2 text-amber-700">필요경비 가이드</th>
                <th className="no-print w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {computed.map((c, idx) => (
                <tr key={c.id} className="hover:bg-gray-50/60">
                  <td className="px-2 py-2 text-gray-500 font-medium">{idx + 1}</td>

                  {/* 업종코드 */}
                  <td className="px-2 py-1.5 min-w-[160px]">
                    <input type="text" maxLength={6} value={c.code}
                      onChange={e => updateRow(c.id, 'code', e.target.value)}
                      placeholder="6자리"
                      className="no-print w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <span className="print-only hidden font-mono font-bold text-gray-800">{c.code || '-'}</span>
                    {c.rate && (
                      <p className="text-xs text-green-700 font-semibold mt-0.5 leading-tight">
                        {c.rate.name}
                        {c.rate.subClass && c.rate.subClass !== c.rate.name && (
                          <><span className="text-gray-400 font-normal mx-1">/</span>
                          <span className="text-green-700">{c.rate.subClass}</span></>
                        )}
                        <span className="text-gray-400 font-normal ml-1">· {formatPct(c.rate.simpleRateGeneral)}</span>
                      </p>
                    )}
                    {c.code.length === 6 && !c.rate && (
                      <p className="text-xs text-red-500 no-print">코드 없음</p>
                    )}
                  </td>

                  {/* 수입금액 */}
                  <td className="px-2 py-1.5 text-right">
                    <input type="text" value={c.revenue}
                      onChange={e => updateRow(c.id, 'revenue', e.target.value)}
                      placeholder="0"
                      className="no-print w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <span className="print-only hidden font-mono font-semibold text-gray-800">{c.revenue || '-'}</span>
                  </td>

                  {/* 조정률 (화면 전용) */}
                  <td className="px-2 py-2 no-print">
                    <div className="flex gap-1 flex-wrap justify-center mb-1">
                      {TARGET_PCTS.map(pct => (
                        <button key={pct}
                          onClick={() => updateRow(c.id, 'targetPct', pct)}
                          className={`px-2 py-0.5 rounded text-xs font-bold border transition-all ${
                            c.targetPct === pct
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                          }`}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={200}
                        value={c.targetPct}
                        onChange={e => {
                          const raw = String(e.target.value).trim().replace(',', '.');
                          if (raw === '' || raw === '-') return;
                          const normalized = raw.startsWith('.') ? `0${raw}` : raw;
                          const v = parseFloat(normalized);
                          if (Number.isFinite(v)) updateRow(c.id, 'targetPct', v);
                        }}
                        className="w-16 border border-indigo-300 rounded-lg px-1.5 py-1 text-sm text-center font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-gray-500 font-bold">%</span>
                    </div>
                  </td>

                  {/* 단순기준 소득금액 */}
                  <td className="px-3 py-2 text-right">
                    {c.baseIncome > 0
                      ? <span className="font-mono font-semibold text-gray-700 text-sm">{c.baseIncome.toLocaleString('ko-KR')}</span>
                      : <span className="text-gray-300">-</span>}
                  </td>

                  {/* 목표 소득금액 */}
                  <td className="px-3 py-2 text-right">
                    {c.revNum > 0 && c.rate
                      ? <div>
                          <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold text-sm">
                            {c.targetIncome.toLocaleString('ko-KR')}
                          </span>
                          <p className="text-xs text-blue-600 font-bold text-right mt-0.5">
                            ({Number.isInteger(c.targetPct) ? c.targetPct : c.targetPct.toFixed(2)}%)
                          </p>
                        </div>
                      : c.revNum > 0 && c.code.length === 6 && !c.rate ? (
                        <span className="text-xs text-red-500">코드 없음</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                  </td>

                  {/* 필요경비 가이드 */}
                  <td className="px-3 py-2 text-right">
                    {c.revNum > 0 && c.rate ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold text-sm ${
                          c.requiredExpense >= 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                        {c.requiredExpense.toLocaleString('ko-KR')}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>

                  {/* 삭제 */}
                  <td className="px-1 py-2 text-center no-print">
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(c.id)}
                        className="w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-500 flex items-center justify-center">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* 합계 행 */}
            {rows.length >= 2 && (
              <tfoot>
                <tr className="bg-gray-800 text-white text-sm font-bold">
                  <td colSpan={2} className="px-3 py-2.5">합 계</td>
                  <td className="px-2 py-2.5 text-right font-mono">{totalRev.toLocaleString('ko-KR')}</td>
                  <td className="no-print px-2 py-2.5 text-center text-gray-400 text-xs">행별 조정률 적용</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-300">{totalBaseIncome.toLocaleString('ko-KR')}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-black text-white">{totalTargetIncome.toLocaleString('ko-KR')}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-black text-amber-300">{totalRequiredExpPct.toLocaleString('ko-KR')}</td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* 안내 문구 (화면 전용) */}
        <div className="no-print px-5 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">조정률 버튼 클릭 또는 숫자 직접 입력 (0~200%, 소수 가능)</p>
        </div>
      </div>

      {/* ── 요약 카드 ── (수입이 있으면 표시 — 업종 미입력 시에도 안내) */}
      {totalRev > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {/* 단순기준 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-sm font-bold text-gray-600 mb-2">
              단순기준 소득금액
              <span className="text-xs text-gray-400 font-normal ml-1">(조정률 100%)</span>
            </p>
            <p className="text-base font-bold text-gray-800 font-mono break-all">
              {totalBaseIncome > 0 ? formatKRW(totalBaseIncome) : <span className="text-gray-400 text-sm font-normal">6자리 업종코드 입력</span>}
            </p>
          </div>
          {/* 목표 소득금액 ★ */}
          <div className="bg-white rounded-2xl border-2 border-blue-400 p-4 text-center shadow-md">
            <p className="text-sm font-bold text-blue-700 mb-2">★ 목표 소득금액</p>
            <p className="text-base font-black text-blue-800 font-mono break-all">
              {totalBaseIncome > 0 ? (
                <>
                  {formatKRW(totalTargetIncome)}
                  <span className="text-sm font-bold text-blue-600 ml-1">
                    ({totalRev > 0 ? ((totalTargetIncome / totalRev) * 100).toFixed(1) : '0'}%)
                  </span>
                </>
              ) : (
                <span className="text-gray-400 text-sm font-normal">단순기준 산출 후 표시</span>
              )}
            </p>
          </div>
          {/* 필요경비 가이드 ★ */}
          <div className="bg-white rounded-2xl border-2 border-amber-400 p-4 text-center shadow-md">
            <p className="text-sm font-bold text-amber-700 mb-2">
              ★ 필요경비 가이드
              <span className="text-xs text-amber-500 font-normal ml-1">(수입−목표소득)</span>
            </p>
            <p className="text-base font-black text-amber-700 font-mono break-all">
              {totalBaseIncome > 0 ? formatKRW(totalRequiredExpPct) : <span className="text-gray-400 text-sm font-normal">단순기준 산출 후 표시</span>}
            </p>
          </div>
        </div>
      )}

      {/* ── 실제 지출 입력 ── */}
      <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${printInputExpenseDetail ? '' : 'no-print'}`}>
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-gray-700">실제 지출 입력</h3>
          <button
            type="button"
            onClick={addCustomExpense}
            className="no-print flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow shrink-0">
            + 항목 추가
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          <ExpenseRow label="카드이용총액" value={card}  onChange={setCard}  revenue={totalRev} />
          <ExpenseRow label="세금과공과금" value={tax}   onChange={setTax}   revenue={totalRev} />
          <ExpenseRow label="대출이자"     value={loan}  onChange={setLoan}  revenue={totalRev} />
          <ExpenseRow label="기타비용"     value={other} onChange={setOther} revenue={totalRev} />
          {customExpenses.map(c => (
            <div key={c.id} className="px-5 py-3 flex items-center gap-3 min-w-0">
              <input
                type="text"
                value={c.label}
                onChange={e => updateCustomExpense(c.id, { label: e.target.value })}
                placeholder="항목명"
                maxLength={20}
                className="no-print w-28 shrink-0 border border-gray-200 rounded-xl px-2 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="print-only hidden w-28 shrink-0 text-sm font-semibold text-gray-700">{c.label || '추가항목'}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={c.amount}
                onChange={e => {
                  const ne = e.nativeEvent as InputEvent;
                  if (ne.isComposing) return;
                  updateCustomExpense(c.id, { amount: fmt(e.target.value) });
                }}
                onCompositionEnd={e => {
                  updateCustomExpense(c.id, { amount: fmt(e.currentTarget.value) });
                }}
                placeholder="0"
                className="flex-1 min-w-0 min-h-[2.5rem] border border-gray-200 rounded-xl px-3 py-2 text-base text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="w-16 text-right shrink-0 flex items-center justify-end gap-1">
                {totalRev > 0 && toNum(c.amount) > 0
                  ? <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-sm font-bold">
                      {((toNum(c.amount) / totalRev) * 100).toFixed(1)}%
                    </span>
                  : <span className="text-gray-400 text-sm">-</span>}
                <button
                  type="button"
                  onClick={() => removeCustomExpense(c.id)}
                  className="no-print shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-500 flex items-center justify-center"
                  title="삭제">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">합 계</span>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-gray-900 text-base">
                {totalExpense > 0 ? formatKRW(totalExpense) : '-'}
              </span>
              {totalRev > 0 && totalExpense > 0 && (
                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm font-bold">
                  {((totalExpense / totalRev) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 핵심 비교 GAP ── */}
      {requiredExpense !== null && (() => {
        const tone = gap === null ? 'gray' : gap > 0 ? 'green' : gap < 0 ? 'red' : 'blue';
        const cls = {
          gray:  { wrap: 'bg-gray-50 border-gray-300',    title: 'text-gray-700',   label: 'text-gray-500',   val: 'text-gray-800',   gap: 'text-gray-700',   msg: 'text-gray-600'   },
          green: { wrap: 'bg-green-50 border-green-400',  title: 'text-green-700',  label: 'text-green-600',  val: 'text-green-800',  gap: 'text-green-700',  msg: 'text-green-700'  },
          red:   { wrap: 'bg-red-50 border-red-400',      title: 'text-red-700',    label: 'text-red-500',    val: 'text-red-800',    gap: 'text-red-700',    msg: 'text-red-700'    },
          blue:  { wrap: 'bg-blue-50 border-blue-400',    title: 'text-blue-700',   label: 'text-blue-500',   val: 'text-blue-800',   gap: 'text-blue-700',   msg: 'text-blue-700'   },
        }[tone];
        return (
          <div className={`rounded-2xl border-2 p-5 ${cls.wrap} ${printInputExpenseDetail ? '' : 'no-print'}`}>
            <h3 className={`text-xl font-black mb-4 ${cls.title}`}>
              ★ 핵심 비교
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="text-center">
                <p className={`text-sm font-semibold mb-1 ${cls.label}`}>입력 지출 합계</p>
                <p className={`text-xl font-black font-mono ${cls.val}`}>
                  {totalExpense > 0 ? formatKRW(totalExpense) : '-'}
                </p>
              </div>
              <div className="text-center">
                <p className={`text-sm font-semibold mb-1 ${cls.label}`}>목표 경비 가이드</p>
                <p className={`text-xl font-black font-mono ${cls.val}`}>{formatKRW(requiredExpense)}</p>
              </div>
              <div className="text-center">
                <p className={`text-sm font-semibold mb-1 ${cls.label}`}>
                  {gap === null ? '차액' : gap > 0 ? '경비 초과' : gap < 0 ? '경비 부족' : '정확히 일치'}
                </p>
                {gap !== null
                  ? <p className={`text-2xl font-black font-mono ${cls.gap}`}>
                      {gap > 0 ? '+' : gap < 0 ? '-' : ''}{formatKRW(Math.abs(gap))}
                    </p>
                  : <p className={`text-sm ${cls.label}`}>지출 입력 필요</p>}
              </div>
            </div>
            {gap !== null && gap < 0 && (
              <p className={`text-sm font-semibold text-center ${cls.msg}`}>
                → 목표 소득금액을 달성하려면 경비를 {formatKRW(Math.abs(gap))} 더 인식해야 합니다.
              </p>
            )}
            {gap !== null && gap > 0 && (
              <p className={`text-sm font-semibold text-center ${cls.msg}`}>
                → 목표 경비 가이드 대비 {formatKRW(Math.abs(gap))} 경비가 초과되었습니다.
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── 지출 행 ───────────────────────────────────────────────
function ExpenseRow({ label, value, onChange, revenue }: {
  label: string; value: string; onChange: (v: string) => void; revenue: number;
}) {
  const num      = toNum(value);
  const curRatio = revenue > 0 && num > 0 ? ((num / revenue) * 100).toFixed(1) + '%' : null;
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const ne = e.nativeEvent as InputEvent;
    if (ne.isComposing) return;
    onChange(fmt(e.target.value));
  };
  const handleCompositionEnd = (e: CompositionEvent<HTMLInputElement>) => {
    onChange(fmt(e.currentTarget.value));
  };
  return (
    <div className="px-5 py-3 flex items-center gap-3 min-w-0">
      <div className="w-28 shrink-0 text-sm font-semibold text-gray-700">{label}</div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={handleChange}
        onCompositionEnd={handleCompositionEnd}
        placeholder="0"
        className="flex-1 min-w-0 min-h-[2.5rem] border border-gray-200 rounded-xl px-3 py-2 text-base text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      <div className="w-16 text-right shrink-0">
        {curRatio
          ? <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-sm font-bold">{curRatio}</span>
          : <span className="text-gray-400 text-sm">-</span>}
      </div>
    </div>
  );
}
