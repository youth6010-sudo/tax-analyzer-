'use client';

import { useState, useEffect, Fragment, useRef, useCallback, type ChangeEventHandler } from 'react';
import SimulationSection from './components/SimulationSection';
import { loadIndustryRates, findIndustryRate, formatKRW, formatPct } from './utils/calculator';
import type { IndustryRate } from './types';
import {
  LS_MAIN,
  LS_SIM,
  SESSION_FILE_VERSION,
  type MainPersist,
  type SimPersist,
  type FullSessionFile,
} from './utils/taxSessionStorage';

// ── 공통 캡처 함수 — data-capture CSS 적용 후 canvas 반환
async function captureCanvas(): Promise<HTMLCanvasElement> {
  window.scrollTo(0, 0);
  document.body.setAttribute('data-capture', '');

  await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 400));

  const mainEl = document.querySelector('main') as HTMLElement;
  if (!mainEl) throw new Error('콘텐츠 영역을 찾을 수 없습니다.');

  // 여백 래퍼 추가 — 캡처 이미지 양쪽 여백 확보
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'background:#ffffff; padding: 0 20px 20px 20px; display:inline-block; width:100%;';
  mainEl.parentNode!.insertBefore(wrapper, mainEl);
  wrapper.appendChild(mainEl);

  void wrapper.getBoundingClientRect();
  await new Promise(r => requestAnimationFrame(r));

  const html2canvas = (await import('html2canvas-pro')).default;
  const canvas = await html2canvas(wrapper, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    removeContainer: true,
    x: 0,
    y: 0,
    width: wrapper.scrollWidth,
    height: wrapper.scrollHeight,
    windowWidth: wrapper.scrollWidth,
    windowHeight: wrapper.scrollHeight,
  });

  // 래퍼 해제 — DOM 복원
  wrapper.parentNode!.insertBefore(mainEl, wrapper);
  wrapper.remove();

  return canvas;
}

/** Chrome·Edge 등: 저장 대화상자로 폴더·파일명 지정. 미지원 시 기본 다운로드 폴더로 저장. */
async function saveBlobWithLocation(
  blob: Blob,
  suggestedName: string,
  types: { description: string; accept: Record<string, string[]> }[],
): Promise<void> {
  type PickerOpts = { suggestedName: string; types: typeof types };
  type PickerFn = (opts: PickerOpts) => Promise<FileSystemFileHandle>;
  const picker =
    typeof window !== 'undefined' && 'showSaveFilePicker' in window && typeof (window as Window & { showSaveFilePicker: PickerFn }).showSaveFilePicker === 'function'
      ? (window as Window & { showSaveFilePicker: PickerFn }).showSaveFilePicker
      : null;
  if (picker) {
    try {
      const handle = await picker({ suggestedName, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
      if (name === 'AbortError') return;
      throw e;
    }
  }
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF 저장 — 캡처 이미지를 A4 PDF로 저장
async function saveAsPDF(filename: string) {
  const suggestedName = `${filename}.pdf`;
  try {
    const canvas = await captureCanvas();
    const { jsPDF } = await import('jspdf');
    const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = pdf.internal.pageSize.getWidth();
    const pageH  = pdf.internal.pageSize.getHeight();
    const imgH   = (canvas.height / canvas.width) * pageW;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    let srcY = 0, remaining = imgH;
    while (remaining > 0) {
      if (srcY > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -srcY, pageW, imgH);
      srcY += pageH;
      remaining -= pageH;
    }
    const blob = pdf.output('blob');
    await saveBlobWithLocation(blob, suggestedName, [
      { description: 'PDF 문서', accept: { 'application/pdf': ['.pdf'] } },
    ]);
  } catch (e) {
    alert('PDF 저장 중 오류가 발생했습니다.\n' + String(e));
  } finally {
    document.body.removeAttribute('data-capture');
  }
}

// ── JPG 저장 — 캡처 이미지를 JPG 파일로 저장
async function saveAsJPG(filename: string) {
  const suggestedName = `${filename}.jpg`;
  try {
    const canvas = await captureCanvas();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), 'image/jpeg', 0.93);
    });
    await saveBlobWithLocation(blob, suggestedName, [
      { description: 'JPEG 이미지', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
    ]);
  } catch (e) {
    alert('JPG 저장 중 오류가 발생했습니다.\n' + String(e));
  } finally {
    document.body.removeAttribute('data-capture');
  }
}

// ── 타입 ──────────────────────────────────────────────────
interface BusinessRow {
  id: string;
  industryCode: string;
  totalRevenue: string;
  totalExpenses: string;
}

interface ComputedRow extends BusinessRow {
  revNum: number;
  expNum: number;
  netIncome: number;
  incomeRate: number;
  expenseRate: number;
  industryRate: IndustryRate | null;
  baseIncome: number;
  baseIncomeRate: number;
  incomeRateDiff: number;
  pastStdRatio: number;
}

// ── 필요경비 항목 ──────────────────────────────────────────
const EXPENSE_ITEMS = [
  { key: 'costOfGoods',   label: '매출원가',        hint: '상품·제품원가' },
  { key: 'labor',         label: '노무비',          hint: '' },
  { key: 'expenses',      label: '경비',            hint: '' },
  { key: 'salary',        label: '급여',            hint: '급여·임금·제수당' },
  { key: 'taxPublic',     label: '제세공과금',      hint: '' },
  { key: 'rent',          label: '임차료',          hint: '' },
  { key: 'interest',      label: '지급이자',        hint: '' },
  { key: 'entertainment', label: '기업업무추진비',  hint: '' },
  { key: 'donation',      label: '기부금',          hint: '' },
  { key: 'depreciation',  label: '감가상각비',      hint: '' },
  { key: 'vehicle',       label: '차량유지비',      hint: '' },
  { key: 'commission',    label: '지급수수료',      hint: '' },
  { key: 'supplies',      label: '소모품비',        hint: '' },
  { key: 'welfare',       label: '복리후생비',      hint: '' },
  { key: 'freight',       label: '운반비',          hint: '' },
  { key: 'advertising',   label: '광고선전비',      hint: '' },
  { key: 'travel',        label: '여비교통비',      hint: '' },
  { key: 'other',         label: '기타',            hint: '' },
] as const;

type ExpenseMap = Record<string, string>;

interface CustomExpenseDef {
  id: string;
  label: string;
}

interface RowDetail {
  show: boolean;
  expenses: ExpenseMap;
  /** 상세분석에서 추가한 항목 (행마다 독립) */
  customDefs: CustomExpenseDef[];
}

const initExpenses = (): ExpenseMap =>
  Object.fromEntries(EXPENSE_ITEMS.map(i => [i.key, ''])) as ExpenseMap;

const customExpenseKey = (id: string) => `c_${id}`;

let _customItemUid = 0;
const nextCustomExpenseId = () => String(++_customItemUid);

function mergeDetailExpenses(raw: RowDetail | undefined): ExpenseMap {
  const base = initExpenses();
  if (!raw) return base;
  const merged = { ...base, ...raw.expenses };
  for (const c of raw.customDefs ?? []) {
    const k = customExpenseKey(c.id);
    if (merged[k] === undefined) merged[k] = '';
  }
  return merged;
}

function sumExpenseInputs(detail: RowDetail): number {
  let s = 0;
  for (const i of EXPENSE_ITEMS) s += toNum(detail.expenses[i.key]);
  for (const c of detail.customDefs ?? []) s += toNum(detail.expenses[customExpenseKey(c.id)]);
  return s;
}

// ── 유틸 ──────────────────────────────────────────────────
const fmt = (v: string) => {
  const n = v.replace(/[^0-9]/g, '');
  return n ? parseInt(n).toLocaleString('ko-KR') : '';
};
const toNum = (v: string | undefined) => v ? parseFloat(v.replace(/,/g, '')) || 0 : 0;

let _uid = 0;
const uid = () => String(++_uid);
const makeRow = (): BusinessRow => ({ id: uid(), industryCode: '', totalRevenue: '', totalExpenses: '' });

function bumpUidFromRowIds(ids: string[]) {
  for (const id of ids) {
    const n = parseInt(id, 10);
    if (!Number.isNaN(n)) _uid = Math.max(_uid, n);
  }
}

function computeRow(row: BusinessRow, allRates: Record<string, IndustryRate>): ComputedRow {
  const revNum  = toNum(row.totalRevenue);
  const expNum  = toNum(row.totalExpenses);
  const netIncome    = revNum - expNum;
  const incomeRate   = revNum > 0 ? (netIncome / revNum) * 100 : 0;
  const expenseRate  = revNum > 0 ? (expNum   / revNum) * 100 : 0;
  const industryRate = findIndustryRate(row.industryCode, allRates);
  const baseExpRate  = industryRate?.simpleRateGeneral ?? 0;
  const baseIncome   = industryRate && revNum > 0 ? Math.trunc(revNum * (1 - baseExpRate / 100)) : 0;
  const baseIncomeRate = industryRate ? 100 - baseExpRate : 0;
  const incomeRateDiff = industryRate && revNum > 0 ? incomeRate - baseIncomeRate : 0;
  const pastStdRatio   = baseIncome > 0 ? (netIncome / baseIncome) * 100 : 0;
  return { ...row, revNum, expNum, netIncome, incomeRate, expenseRate, industryRate, baseIncome, baseIncomeRate, incomeRateDiff, pastStdRatio };
}

// ── 필요경비 항목별 비율 테이블 ────────────────────────────
function ExpenseRatioTable({ expMap, revenue, printClass, extraDefs = [] }: {
  expMap: ExpenseMap; revenue: number; printClass: string;
  extraDefs?: { key: string; label: string }[];
}) {
  const baseDefs = EXPENSE_ITEMS.map(i => ({ key: i.key, label: i.label }));
  const allDefs = [...baseDefs, ...extraDefs];
  const items = allDefs.map(i => ({ ...i, amount: toNum(expMap[i.key]) })).filter(i => i.amount > 0);
  if (items.length === 0) return null;
  const total    = items.reduce((s, i) => s + i.amount, 0);
  const maxRatio = Math.max(...items.map(i => revenue > 0 ? (i.amount / revenue) * 100 : 0));
  return (
    <div className={`${printClass} overflow-x-auto`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-amber-50 text-gray-500 border-b border-amber-100">
            <th className="text-left px-3 py-1.5 font-semibold">항목</th>
            <th className="text-right px-3 py-1.5 font-semibold">금액</th>
            <th className="text-right px-3 py-1.5 font-semibold w-16">매출대비</th>
            <th className="px-3 py-1.5 w-24 no-print">비율</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map(e => {
            const ratio = revenue > 0 ? (e.amount / revenue) * 100 : 0;
            const barW  = maxRatio > 0 ? (ratio / maxRatio) * 100 : 0;
            return (
              <tr key={e.key} className="hover:bg-gray-50/50">
                <td className="px-3 py-1.5 font-medium text-gray-700">{e.label}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-800">{e.amount.toLocaleString('ko-KR')}</td>
                <td className="px-3 py-1.5 text-right">
                  <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-[10px] ${
                    ratio >= 20 ? 'bg-red-100 text-red-700'
                    : ratio >= 10 ? 'bg-orange-100 text-orange-700'
                    : ratio >= 5  ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {ratio.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-1.5 no-print">
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${barW}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="bg-amber-50 font-bold border-t border-amber-200">
            <td className="px-3 py-1.5 text-amber-800">합 계</td>
            <td className="px-3 py-1.5 text-right font-mono text-amber-800">{total.toLocaleString('ko-KR')}</td>
            <td className="px-3 py-1.5 text-right">
              <span className="inline-block bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold text-[10px]">
                {revenue > 0 ? ((total / revenue) * 100).toFixed(1) : '0'}%
              </span>
            </td>
            <td className="no-print" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function Home() {
  const [taxpayer, setTaxpayer]     = useState('');   // 소득자
  const [prevYear, setPrevYear]     = useState('');   // 전기 연도
  const [currYear, setCurrYear]     = useState('');   // 당기 연도
  const [rows, setRows]             = useState<BusinessRow[]>([makeRow()]);
  const [allRates, setAllRates]     = useState<Record<string, IndustryRate>>({});
  const [analyzed, setAnalyzed]     = useState(false);
  const [rowDetails, setRowDetails] = useState<Record<string, RowDetail>>({});
  const [printExpDetail, setPrintExpDetail] = useState(false);
  const [printInputExpenseDetail, setPrintInputExpenseDetail] = useState(false);
  const [saving, setSaving] = useState<'pdf' | 'jpg' | null>(null);
  const [persistReady, setPersistReady] = useState(false);
  const simSnapRef = useRef<SimPersist | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadIndustryRates().then(setAllRates).catch(() => {});
  }, []);

  // 브라우저에 저장된 작업 불러오기 (최초 1회)
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_MAIN) : null;
      if (!raw) {
        setPersistReady(true);
        return;
      }
      const m = JSON.parse(raw) as MainPersist;
      if (typeof m.taxpayer === 'string') setTaxpayer(m.taxpayer);
      if (typeof m.prevYear === 'string') setPrevYear(m.prevYear);
      if (typeof m.currYear === 'string') setCurrYear(m.currYear);
      if (Array.isArray(m.rows) && m.rows.length > 0) {
        bumpUidFromRowIds(m.rows.map(r => r.id));
        setRows(m.rows);
      }
      if (m.rowDetails && typeof m.rowDetails === 'object') {
        setRowDetails(m.rowDetails as Record<string, RowDetail>);
        for (const rd of Object.values(m.rowDetails as Record<string, RowDetail>)) {
          for (const c of rd.customDefs ?? []) {
            const n = parseInt(c.id, 10);
            if (!Number.isNaN(n)) _customItemUid = Math.max(_customItemUid, n);
          }
        }
      }
      setAnalyzed(!!m.analyzed);
      setPrintExpDetail(!!m.printExpDetail);
      setPrintInputExpenseDetail(!!m.printInputExpenseDetail);
    } catch {
      /* ignore */
    }
    setPersistReady(true);
  }, []);

  // 입력값 자동 저장 (같은 PC에서 창 닫았다 열어도 유지)
  useEffect(() => {
    if (!persistReady || typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      try {
        const main: MainPersist = {
          taxpayer,
          prevYear,
          currYear,
          rows,
          rowDetails,
          analyzed,
          printExpDetail,
          printInputExpenseDetail,
        };
        localStorage.setItem(LS_MAIN, JSON.stringify(main));
      } catch {
        /* quota 등 */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    persistReady,
    taxpayer,
    prevYear,
    currYear,
    rows,
    rowDetails,
    analyzed,
    printExpDetail,
    printInputExpenseDetail,
  ]);

  const onSimSnapshot = useCallback((s: SimPersist) => {
    simSnapRef.current = s;
  }, []);

  const exportWorkJson = async () => {
    let sim: SimPersist | null = simSnapRef.current;
    if (!sim) {
      try {
        const raw = localStorage.getItem(LS_SIM);
        if (raw) sim = JSON.parse(raw) as SimPersist;
      } catch {
        /* */
      }
    }
    const main: MainPersist = {
      taxpayer,
      prevYear,
      currYear,
      rows,
      rowDetails,
      analyzed,
      printExpDetail,
      printInputExpenseDetail,
    };
    const simData: SimPersist = sim ?? { rows: [], card: '', tax: '', loan: '', other: '' };
    const payload: FullSessionFile = {
      v: SESSION_FILE_VERSION,
      savedAt: new Date().toISOString(),
      main,
      sim: simData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const defaultName = `종합소득세_작업저장_${new Date().toISOString().slice(0, 10)}.json`;
    try {
      await saveBlobWithLocation(blob, defaultName, [
        { description: 'JSON', accept: { 'application/json': ['.json'] } },
      ]);
    } catch (e) {
      alert('작업 저장 파일을 쓰는 중 오류가 발생했습니다.\n' + String(e));
    }
  };

  const onPickImportFile: ChangeEventHandler<HTMLInputElement> = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as FullSessionFile;
        if (data.v !== SESSION_FILE_VERSION || !data.main || !Array.isArray(data.main.rows)) {
          alert('지원하지 않는 파일 형식입니다.');
          return;
        }
        localStorage.setItem(LS_MAIN, JSON.stringify(data.main));
        if (data.sim && Array.isArray(data.sim.rows)) {
          localStorage.setItem(LS_SIM, JSON.stringify(data.sim));
        } else {
          localStorage.removeItem(LS_SIM);
        }
        window.location.reload();
      } catch {
        alert('파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // 행 상태
  const updateRow = (id: string, field: keyof BusinessRow, value: string) => {
    setAnalyzed(false);
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (field === 'industryCode') return { ...r, industryCode: value.replace(/[^0-9]/g, '').slice(0, 6) };
      return { ...r, [field]: fmt(value) };
    }));
  };
  const addRow    = () => setRows(prev => [...prev, makeRow()]);
  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(prev => prev.filter(r => r.id !== id));
      setRowDetails(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  // 행별 상세분석 상태
  const getDetail = (id: string): RowDetail => {
    const raw = rowDetails[id];
    if (!raw) return { show: false, expenses: initExpenses(), customDefs: [] };
    return {
      show: raw.show,
      customDefs: raw.customDefs ?? [],
      expenses: mergeDetailExpenses(raw),
    };
  };

  const toggleDetail = (id: string) => {
    setRowDetails(prev => {
      const cur = prev[id] ?? { show: false, expenses: initExpenses(), customDefs: [] };
      return { ...prev, [id]: { ...cur, show: !cur.show } };
    });
  };

  const updateRowExpense = (rowId: string, key: string, value: string) => {
    setRowDetails(prev => {
      const cur = prev[rowId] ?? { show: true, expenses: initExpenses(), customDefs: [] };
      return { ...prev, [rowId]: { ...cur, expenses: { ...mergeDetailExpenses(cur), [key]: fmt(value) } } };
    });
  };

  const addCustomExpenseItem = (rowId: string) => {
    const cid = nextCustomExpenseId();
    setRowDetails(prev => {
      const cur = prev[rowId] ?? { show: true, expenses: initExpenses(), customDefs: [] };
      const k = customExpenseKey(cid);
      return {
        ...prev,
        [rowId]: {
          ...cur,
          customDefs: [...(cur.customDefs ?? []), { id: cid, label: '추가항목' }],
          expenses: { ...mergeDetailExpenses(cur), [k]: '' },
        },
      };
    });
  };

  const updateCustomExpenseLabel = (rowId: string, customId: string, label: string) => {
    setRowDetails(prev => {
      const cur = prev[rowId];
      if (!cur) return prev;
      return {
        ...prev,
        [rowId]: {
          ...cur,
          customDefs: (cur.customDefs ?? []).map(x => (x.id === customId ? { ...x, label } : x)),
        },
      };
    });
  };

  const removeCustomExpenseItem = (rowId: string, customId: string) => {
    const k = customExpenseKey(customId);
    setRowDetails(prev => {
      const cur = prev[rowId];
      if (!cur) return prev;
      const merged = mergeDetailExpenses(cur);
      const { [k]: _removed, ...rest } = merged;
      return {
        ...prev,
        [rowId]: {
          ...cur,
          customDefs: (cur.customDefs ?? []).filter(x => x.id !== customId),
          expenses: rest,
        },
      };
    });
  };

  const handleAnalyze = () => setAnalyzed(true);
  const handleReset = () => {
    try {
      localStorage.removeItem(LS_MAIN);
      localStorage.removeItem(LS_SIM);
    } catch {
      /* */
    }
    simSnapRef.current = null;
    setRows([makeRow()]);
    setAnalyzed(false);
    setTaxpayer('');
    setPrevYear('');
    setCurrYear('');
    setRowDetails({});
    setPrintExpDetail(false);
    setPrintInputExpenseDetail(false);
  };

  const handleSave = async (format: 'pdf' | 'jpg') => {
    const name = [taxpayer, prevYear ? `${prevYear}년` : '', '종합소득세분석']
      .filter(Boolean).join('_');
    setSaving(format);
    try {
      if (format === 'pdf') await saveAsPDF(name);
      else await saveAsJPG(name);
    } finally {
      setSaving(null);
    }
  };

  const computed   = rows.map(r => computeRow(r, allRates));
  const activeRows = computed.filter(c => c.revNum > 0);
  const totalRev   = computed.reduce((s, r) => s + r.revNum, 0);
  const totalExp   = computed.reduce((s, r) => s + r.expNum, 0);
  const totalNet   = totalRev - totalExp;
  const totalRate  = totalRev > 0 ? (totalNet / totalRev) * 100 : 0;

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  // 상세분석이 입력된 행이 있는지 확인
  const hasAnyExpDetail = rows.some(r => sumExpenseInputs(getDetail(r.id)) > 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">

      {/* ── 인쇄 전용 헤더 ── */}
      <div className="print-only hidden border-b-2 border-gray-900 pb-2 mb-3 px-2">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-end gap-2 flex-wrap flex-1 min-w-0">
            {taxpayer && <span className="print-header-taxpayer font-black text-blue-900 self-center mr-4">{taxpayer}</span>}
            <span className="print-header-title font-black text-gray-900">종합소득세 분석</span>
            <span className="print-header-date font-normal text-gray-400 ml-2">{today}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="세무법인청년들" className="print-header-logo object-contain shrink-0 self-center" />
        </div>
      </div>

      {/* ── 화면 헤더 ── */}
      <header className="bg-white border-b border-gray-100 shadow-sm no-print">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          {/* 타이틀 행 */}
          <div className="flex items-end gap-3 mb-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow shrink-0 self-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            {taxpayer && <span className="text-2xl font-black text-blue-900 leading-none self-center mr-4">{taxpayer}</span>}
            <span className="text-lg font-black text-gray-900">종합소득세 분석</span>
            <span className="text-xs font-normal text-gray-400 ml-2">{today}</span>
            <div className="flex gap-2 ml-auto items-center">
              {analyzed && (
                <>
                  <button onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors shadow">
                    🖨 인쇄
                  </button>
                  <button
                    onClick={() => handleSave('pdf')}
                    disabled={saving !== null}
                    title="Chrome·Edge: 저장 위치와 파일명을 선택할 수 있습니다. Safari 등은 다운로드 폴더로 저장됩니다."
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors shadow disabled:opacity-50">
                    {saving === 'pdf' ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : '📄'} PDF
                  </button>
                  <button
                    onClick={() => handleSave('jpg')}
                    disabled={saving !== null}
                    title="Chrome·Edge: 저장 위치와 파일명을 선택할 수 있습니다. Safari 등은 다운로드 폴더로 저장됩니다."
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors shadow disabled:opacity-50">
                    {saving === 'jpg' ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : '🖼'} JPG
                  </button>
                </>
              )}
              <button onClick={() => void exportWorkJson()}
                className="px-3 py-2 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                title="입력·시뮬레이션을 JSON으로 저장 (Chrome·Edge에서는 저장 위치 선택 가능)">
                💾 작업저장
              </button>
              <button type="button" onClick={() => fileImportRef.current?.click()}
                className="px-3 py-2 text-sm text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                title="JSON 파일에서 불러오기 (페이지가 새로고침됩니다)">
                📂 작업불러오기
              </button>
              <input ref={fileImportRef} type="file" accept=".json,application/json" className="hidden" onChange={onPickImportFile} />
              <button onClick={handleReset}
                className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                초기화
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="세무법인청년들" className="h-[2.7rem] w-auto max-h-[2.7rem] object-contain ml-2 border-l border-gray-100 pl-3 shrink-0 self-center" />
            </div>
          </div>

          {/* 입력 3개 한 줄 */}
          <div className="flex gap-3">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-bold text-gray-500 shrink-0 w-8">전기</span>
              <input type="text" value={prevYear} onChange={e => setPrevYear(e.target.value)}
                placeholder="연도 (예: 2024)"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 font-mono"
              />
              <span className="text-xs text-gray-400 shrink-0">년</span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-bold text-gray-500 shrink-0 w-8">당기</span>
              <input type="text" value={currYear} onChange={e => setCurrYear(e.target.value)}
                placeholder="연도 (예: 2025)"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 font-mono"
              />
              <span className="text-xs text-gray-400 shrink-0">년</span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs font-bold text-gray-500 shrink-0 w-12">소득자</span>
              <input type="text" value={taxpayer} onChange={e => setTaxpayer(e.target.value)}
                placeholder="성명 / 상호"
                className="flex-1 border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50/40 font-medium"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── 입력 테이블 (인쇄 제외) ── */}
        <div className="no-print bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-800">총수입금액 및 필요경비 명세</h2>
              <p className="text-xs text-gray-400 mt-0.5">업종코드별 수입·경비 입력 — 행별 <span className="text-amber-600 font-semibold">상세분석</span> 버튼으로 필요경비 항목 입력 가능</p>
            </div>
            <button onClick={addRow}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              항목 추가
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-[11px]">
                  <th className="text-left px-2 py-2 font-semibold w-6">#</th>
                  <th className="text-left px-2 py-2 font-semibold">주업종코드</th>
                  <th className="text-right px-2 py-2 font-semibold">총수입금액</th>
                  <th className="text-right px-2 py-2 font-semibold">필요경비합계</th>
                  <th className="text-right px-2 py-2 font-semibold text-green-700">소득금액</th>
                  <th className="text-right px-2 py-2 font-semibold text-blue-700">실제소득율</th>
                  <th className="text-right px-2 py-2 font-semibold text-indigo-700">단순경비율 / 기준소득율</th>
                  <th className="text-right px-2 py-2 font-semibold text-indigo-600">기준소득금액</th>
                  <th className="text-right px-2 py-2 font-semibold text-purple-700">표준대비</th>
                  <th className="text-center px-2 py-2 font-semibold text-amber-600 w-16">상세분석</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const c      = computed[idx];
                  const detail = getDetail(row.id);
                  const matched = c.industryRate;
                  const hasDetail = sumExpenseInputs(detail) > 0;
                  const expTotal = sumExpenseInputs(detail);
                  const expDiff  = c.expNum - expTotal;

                  return (
                    <Fragment key={row.id}>
                      {/* 메인 행 */}
                      <tr className={`border-t border-gray-50 hover:bg-gray-50/40 ${detail.show ? 'bg-amber-50/20' : ''}`}>
                        <td className="px-2 py-2 text-gray-400">{idx + 1}</td>

                        {/* 업종코드 */}
                        <td className="px-2 py-1.5 min-w-[130px]">
                          <input type="text" maxLength={6} value={row.industryCode}
                            onChange={e => updateRow(row.id, 'industryCode', e.target.value)}
                            placeholder="6자리"
                            className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          {matched && (
                            <p className="text-[10px] text-green-700 font-medium mt-0.5 leading-tight" title={`${matched.name} / ${matched.subClass}`}>
                              ✓ {matched.name}
                              {matched.subClass && matched.subClass !== matched.name && (
                                <><span className="text-gray-400 mx-0.5">/</span>
                                <span className="text-green-700">{matched.subClass}</span></>
                              )}
                            </p>
                          )}
                          {row.industryCode.length === 6 && !matched && (
                            <p className="text-[10px] text-red-400">코드 없음</p>
                          )}
                        </td>

                        {/* 총수입금액 */}
                        <td className="px-2 py-1.5 text-right">
                          <input type="text" value={row.totalRevenue}
                            onChange={e => updateRow(row.id, 'totalRevenue', e.target.value)}
                            placeholder="0"
                            className="w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </td>

                        {/* 필요경비합계 */}
                        <td className="px-2 py-1.5 text-right">
                          <input type="text" value={row.totalExpenses}
                            onChange={e => updateRow(row.id, 'totalExpenses', e.target.value)}
                            placeholder="0"
                            className="w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          {hasDetail && (
                            <p className={`text-[10px] mt-0.5 text-right ${Math.abs(expDiff) < 1000 ? 'text-green-500' : 'text-red-400'}`}>
                              항목합계 {expTotal.toLocaleString('ko-KR')}
                              {Math.abs(expDiff) >= 1000 && ` (차 ${expDiff > 0 ? '+' : ''}${expDiff.toLocaleString('ko-KR')})`}
                            </p>
                          )}
                        </td>

                        {/* 소득금액 */}
                        <td className="px-2 py-2 text-right">
                          {c.revNum > 0
                            ? <span className={`font-bold font-mono text-xs ${c.netIncome >= 0 ? 'text-green-600' : 'text-red-500'}`}>{c.netIncome.toLocaleString('ko-KR')}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>

                        {/* 실제소득율 */}
                        <td className="px-2 py-2 text-right">
                          {c.revNum > 0
                            ? <span className="inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[11px]">{formatPct(c.incomeRate)}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>

                        {/* 단순경비율 / 기준소득율 */}
                        <td className="px-2 py-2 text-right">
                          {matched
                            ? <div className="flex items-center justify-end gap-1">
                                <span className="inline-block bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold text-[11px]">
                                  경비 {formatPct(matched.simpleRateGeneral)}
                                </span>
                                <span className="text-gray-300 text-[10px]">/</span>
                                <span className="inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[11px]">
                                  소득 {formatPct(100 - matched.simpleRateGeneral)}
                                </span>
                              </div>
                            : <span className="text-gray-300">-</span>}
                        </td>

                        {/* 기준소득금액 */}
                        <td className="px-2 py-2 text-right">
                          {c.baseIncome > 0
                            ? <span className="font-mono text-indigo-600 font-semibold text-xs">{c.baseIncome.toLocaleString('ko-KR')}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>

                        {/* 표준대비 */}
                        <td className="px-2 py-2 text-right">
                          {c.revNum > 0 && c.industryRate
                            ? <div className="space-y-0.5 text-right">
                                <span className={`inline-block px-1.5 py-0.5 rounded font-bold text-[11px] ${c.incomeRateDiff >= 0 ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'}`}>
                                  {c.incomeRateDiff >= 0 ? '+' : ''}{formatPct(c.incomeRateDiff)}
                                </span>
                                <p className="text-[10px] text-purple-500 font-semibold">{formatPct(c.pastStdRatio)}</p>
                              </div>
                            : <span className="text-gray-300">-</span>}
                        </td>

                        {/* 상세분석 토글 */}
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => toggleDetail(row.id)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                              detail.show
                                ? 'bg-amber-500 text-white border-amber-500'
                                : hasDetail
                                  ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                                  : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                            }`}>
                            {detail.show ? '▲ 접기' : hasDetail ? '✓ 상세' : '+ 상세'}
                          </button>
                        </td>

                        {/* 삭제 */}
                        <td className="px-1 py-2 text-center">
                          {rows.length > 1 && (
                            <button onClick={() => removeRow(row.id)}
                              className="w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center">
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* 상세분석 확장 행 */}
                      {detail.show && (
                        <tr className="border-t border-amber-100">
                          <td colSpan={11} className="p-0">
                            <div className="bg-amber-50/40 border-l-4 border-amber-400 px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-amber-800">
                                  #{idx + 1} {matched?.name ?? row.industryCode} — 필요경비 항목별 입력
                                </span>
                                {c.expNum > 0 && (
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                    Math.abs(expDiff) < 1000 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                                  }`}>
                                    항목합계 {expTotal.toLocaleString('ko-KR')} / 필요경비 {c.expNum.toLocaleString('ko-KR')}
                                    {Math.abs(expDiff) >= 1000 && ` → 차액 ${expDiff > 0 ? '+' : ''}${expDiff.toLocaleString('ko-KR')}`}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {EXPENSE_ITEMS.map(item => {
                                  const num   = toNum(detail.expenses[item.key]);
                                  const ratio = c.revNum > 0 && num > 0 ? (num / c.revNum) * 100 : null;
                                  return (
                                    <div key={item.key} className="flex items-center gap-1.5">
                                      <div className="shrink-0 w-20 text-[10px] font-semibold text-gray-600 leading-tight">{item.label}</div>
                                      <input
                                        type="text"
                                        value={detail.expenses[item.key]}
                                        onChange={e => updateRowExpense(row.id, item.key, e.target.value)}
                                        placeholder="0"
                                        className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-right font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                      />
                                      {ratio !== null
                                        ? <span className="shrink-0 w-10 text-center text-[10px] font-bold text-amber-700">{ratio.toFixed(1)}%</span>
                                        : <span className="shrink-0 w-10 text-gray-300 text-center text-[10px]">-</span>}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-3 pt-2 border-t border-amber-200/80 flex flex-wrap items-center justify-between gap-2 no-print">
                                <span className="text-[10px] font-bold text-amber-800 shrink-0">추가 필요경비 항목</span>
                                <button
                                  type="button"
                                  onClick={() => addCustomExpenseItem(row.id)}
                                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors">
                                  + 항목 추가
                                </button>
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                                {(detail.customDefs ?? []).map(cd => {
                                  const k = customExpenseKey(cd.id);
                                  const num = toNum(detail.expenses[k]);
                                  const ratio = c.revNum > 0 && num > 0 ? (num / c.revNum) * 100 : null;
                                  return (
                                    <div key={cd.id} className="flex items-center gap-1.5 sm:col-span-2">
                                      <input
                                        type="text"
                                        value={cd.label}
                                        onChange={e => updateCustomExpenseLabel(row.id, cd.id, e.target.value)}
                                        placeholder="항목명"
                                        maxLength={16}
                                        className="shrink-0 w-[5.5rem] border border-amber-200 rounded-lg px-1.5 py-1.5 text-[10px] font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                      />
                                      <input
                                        type="text"
                                        value={detail.expenses[k] ?? ''}
                                        onChange={e => updateRowExpense(row.id, k, e.target.value)}
                                        placeholder="0"
                                        className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-right font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                      />
                                      {ratio !== null
                                        ? <span className="shrink-0 w-10 text-center text-[10px] font-bold text-amber-700">{ratio.toFixed(1)}%</span>
                                        : <span className="shrink-0 w-10 text-gray-300 text-center text-[10px]">-</span>}
                                      <button
                                        type="button"
                                        onClick={() => removeCustomExpenseItem(row.id, cd.id)}
                                        className="no-print shrink-0 px-1.5 py-1 text-[9px] font-bold text-red-500 hover:bg-red-50 rounded border border-red-200">
                                        삭제
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>

              {/* 합계 행 */}
              {rows.length >= 2 && (
                <tfoot>
                  <tr className="bg-gray-800 text-white text-xs font-bold">
                    <td colSpan={2} className="px-3 py-2.5">합 계</td>
                    <td className="px-2 py-2.5 text-right font-mono">{totalRev.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-2.5 text-right font-mono">{totalExp.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-green-300">{totalNet.toLocaleString('ko-KR')}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="bg-blue-400/30 text-blue-100 px-2 py-0.5 rounded">{formatPct(totalRate)}</span>
                    </td>
                    <td colSpan={5} className="px-2 py-2.5 text-gray-400 text-[10px]">
                      경비율 {formatPct(totalRev > 0 ? (totalExp / totalRev) * 100 : 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 분석 버튼 */}
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40">
            <button
              onClick={handleAnalyze}
              disabled={!rows.some(r => toNum(r.totalRevenue) > 0)}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow disabled:opacity-40 disabled:cursor-not-allowed text-sm">
              분석하기
            </button>
          </div>
        </div>

        {/* ── 분석 결과 ── */}
        {analyzed && (
          <>
            {/* ── 분석 섹션 래퍼 (시뮬레이션과 동일 스타일) ── */}
            <div className="space-y-4 bg-orange-50/30 rounded-3xl border border-orange-100 p-5 shadow-sm">

            {/* 제목 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-8 bg-gradient-to-b from-orange-400 to-amber-500 rounded-full no-print" />
                <h2 className="text-2xl font-black tracking-tight">
                  <mark className="bg-orange-100 px-2 py-0.5 rounded inline-block">
                    {prevYear && <span className="text-orange-400">{prevYear}년 </span>}
                    <span className="text-gray-900">업종코드별 단순경비율 대비 분석</span>
                  </mark>
                </h2>
              </div>
              {hasAnyExpDetail && (
                <label className="no-print flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors shrink-0">
                  <input
                    type="checkbox"
                    checked={printExpDetail}
                    onChange={e => setPrintExpDetail(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                  <span className="text-xs font-bold text-amber-700">항목별 비율분석 인쇄에 포함</span>
                </label>
              )}
            </div>

            {/* 업종별 분석 카드 */}
            <div className="grid gap-3">
              {activeRows.map((c, idx) => {
                const detail  = getDetail(c.id);
                const hasExp  = sumExpenseInputs(detail) > 0;
                const expPrintClass = 'no-print';
                const extraExpenseDefs = (detail.customDefs ?? []).map(x => ({
                  key: customExpenseKey(x.id),
                  label: x.label || '추가항목',
                }));
                return (
                  <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-break">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 mr-3">
                        <span className="text-xs text-gray-400 font-medium">#{idx + 1} 업종코드</span>
                        <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                          <span className="text-xl font-black text-gray-900 font-mono shrink-0">{c.industryCode || '-'}</span>
                          {c.industryRate && (
                            <span className="text-sm font-semibold text-green-700 leading-snug">
                              {c.industryRate.name}
                              {c.industryRate.subClass && c.industryRate.subClass !== c.industryRate.name && (
                                <span className="text-gray-400 font-normal mx-1">/</span>
                              )}
                              {c.industryRate.subClass && c.industryRate.subClass !== c.industryRate.name && (
                                <span className="text-green-700">{c.industryRate.subClass}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      {c.industryRate && (
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">단순경비율 (일반)</p>
                          <p className="text-2xl font-black text-indigo-600">{formatPct(c.industryRate.simpleRateGeneral)}</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-blue-500 mb-1">총수입금액</p>
                        <p className="text-xs font-bold text-blue-700 font-mono">{formatKRW(c.revNum)}</p>
                      </div>
                      <div className="bg-orange-50 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-orange-500 mb-1">필요경비합계</p>
                        <p className="text-xs font-bold text-orange-600 font-mono">{formatKRW(c.expNum)}</p>
                        <p className="text-[10px] text-gray-400">{formatPct(c.expenseRate)}</p>
                      </div>
                      <div className="bg-green-50 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-green-600 mb-1">실제 소득금액</p>
                        <p className="text-xs font-bold text-green-700 font-mono">{formatKRW(c.netIncome)}</p>
                        <p className="text-[10px] text-green-500 font-bold">{formatPct(c.incomeRate)}</p>
                      </div>
                      {c.industryRate
                        ? <div className="bg-indigo-50 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] text-indigo-500 mb-1">기준 소득금액</p>
                            <p className="text-xs font-bold text-indigo-700 font-mono">{formatKRW(c.baseIncome)}</p>
                            <p className="text-[10px] text-indigo-400">{formatPct(c.baseIncomeRate)}</p>
                          </div>
                        : <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] text-gray-400">기준 소득금액</p>
                            <p className="text-xs text-gray-300 mt-1">업종코드 필요</p>
                          </div>}
                    </div>

                    {c.industryRate && c.revNum > 0 && (
                      <div className="space-y-1.5 mb-3">
                        <div className="flex justify-between text-[10px] text-gray-500">
                          <span>실제 소득율 <strong className="text-green-600">{formatPct(c.incomeRate)}</strong></span>
                          <span>기준 소득율 <strong className="text-indigo-600">{formatPct(c.baseIncomeRate)}</strong></span>
                        </div>
                        {/* 진행률 바 - 화면 전용 */}
                        <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden no-print">
                          <div className="absolute left-0 top-0 h-full bg-indigo-300 rounded-full"
                            style={{ width: `${Math.min(c.baseIncomeRate, 100)}%` }} />
                          <div className={`absolute left-0 top-0 h-full rounded-full opacity-80 ${c.incomeRate >= c.baseIncomeRate ? 'bg-green-400' : 'bg-sky-400'}`}
                            style={{ width: `${Math.min(Math.max(c.incomeRate, 0), 100)}%` }} />
                        </div>
                        <div className="flex gap-2 flex-wrap items-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${c.incomeRateDiff >= 0 ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}`}>
                            소득율 차이: {c.incomeRateDiff >= 0 ? '+' : ''}{formatPct(c.incomeRateDiff)} ({c.incomeRateDiff >= 0 ? '기준 초과' : '기준 미달'})
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                            표준 대비: {formatPct(c.pastStdRatio)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 항목별 비율분석 (입력된 경우) */}
                    {hasExp && (
                      <div className={`border-t border-amber-100 pt-2 mt-1 ${expPrintClass}`}>
                        <p className="text-[10px] font-bold text-amber-700 mb-1.5">필요경비 항목별 매출 대비 비율</p>
                        <ExpenseRatioTable expMap={detail.expenses} revenue={c.revNum} printClass="" extraDefs={extraExpenseDefs} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 전체 합계 (2개 이상) */}
            {activeRows.length >= 2 && (
              <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-4 no-break">
                <h3 className="text-xs font-bold text-gray-700 mb-3">전체 합계 분석</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-blue-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-blue-500 mb-1">총수입금액 합계</p>
                    <p className="text-sm font-bold text-blue-700 font-mono">{formatKRW(totalRev)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-orange-500 mb-1">필요경비 합계</p>
                    <p className="text-sm font-bold text-orange-600 font-mono">{formatKRW(totalExp)}</p>
                    <p className="text-[10px] text-gray-400">{formatPct(totalRev > 0 ? (totalExp / totalRev) * 100 : 0)}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-green-600 mb-1">소득금액 합계</p>
                    <p className="text-sm font-bold text-green-700 font-mono">{formatKRW(totalNet)}</p>
                    <p className="text-[10px] text-green-500 font-bold">{formatPct(totalRate)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-500 mb-1">전체 소득율</p>
                    <p className="text-xl font-black text-gray-700">{formatPct(totalRate)}</p>
                  </div>
                </div>
              </div>
            )}

            </div>{/* ── 분석 섹션 래퍼 닫기 ── */}

            {/* 구분선 */}
            <div className="border-t-2 border-dashed border-gray-200 no-print" />

            {/* 시뮬레이션 */}
            <SimulationSection
              allRates={allRates}
              prevExpenseRatios={[]}
              prevRevenue={totalRev}
              currYear={currYear}
              printInputExpenseDetail={printInputExpenseDetail}
              onPrintInputExpenseDetailChange={setPrintInputExpenseDetail}
              onSimSnapshot={onSimSnapshot}
            />
          </>
        )}
      </div>

      {/* ── 인쇄 2페이지: 항목별 비율분석 ── */}
      {analyzed && printExpDetail && hasAnyExpDetail && (
        <div className="print-only hidden exp-detail-page px-2 pt-2">
          <div className="mb-3 pb-2 border-b-2 border-amber-600">
            <h2 className="text-lg font-black text-gray-900">
              {taxpayer && <span className="text-blue-900">{taxpayer} </span>}
              {prevYear && <span className="text-orange-400">{prevYear}년 </span>}
              필요경비 항목별 매출 대비 비율분석
            </h2>
          </div>
          <div className="space-y-4">
            {activeRows.map((c, idx) => {
              const detail = getDetail(c.id);
              const hasExp = sumExpenseInputs(detail) > 0;
              if (!hasExp) return null;
              const extraExpenseDefs = (detail.customDefs ?? []).map(x => ({
                key: customExpenseKey(x.id),
                label: x.label || '추가항목',
              }));
              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 no-break">
                  <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-black text-gray-800 font-mono">#{idx + 1} {c.industryCode}</span>
                    {c.industryRate && (
                      <span className="text-xs text-gray-500">{c.industryRate.name}</span>
                    )}
                    <span className="ml-auto text-xs text-gray-400 font-mono">
                      총수입: {formatKRW(c.revNum)}
                    </span>
                  </div>
                  <ExpenseRatioTable expMap={detail.expenses} revenue={c.revNum} printClass="" extraDefs={extraExpenseDefs} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
