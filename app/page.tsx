'use client';

import { useState, useEffect, Fragment, useRef, useCallback, type ChangeEventHandler } from 'react';
import SimulationSection from './components/SimulationSection';
import NextYearPlanSection, {
  bumpNyCustomUidFromRowDetails,
  resetNyCustomItemUid,
} from './components/NextYearPlanSection';
import ExpenseRatioTable from './components/ExpenseRatioTable';
import IncomeRateStandardCompareBlock from './components/IncomeRateStandardCompareBlock';
import {
  EXPENSE_ITEMS,
  customExpenseKey,
  initExpenses,
  mergeDetailExpenses,
  sumExpenseInputs,
  type RowDetail,
} from './lib/expenseTableModel';
import { fmt, toNum } from './lib/taxAmountFmt';
import type { BusinessRow } from './lib/businessRowCompute';
import { computeRow } from './lib/businessRowCompute';
import { loadIndustryRates, formatKRW, formatPct } from './utils/calculator';
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

  const mainEl = document.querySelector('main') as HTMLElement | null;
  if (!mainEl) {
    document.body.removeAttribute('data-capture');
    throw new Error('콘텐츠 영역을 찾을 수 없습니다.');
  }

  let wrapper: HTMLDivElement | null = null;

  try {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 400));

    wrapper = document.createElement('div');
    wrapper.style.cssText =
      'background:#ffffff; padding: 0 20px 20px 20px; display:inline-block; width:100%;';
    const parent = mainEl.parentNode;
    if (!parent) throw new Error('DOM 오류: main 부모가 없습니다.');

    parent.insertBefore(wrapper, mainEl);
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

    if (wrapper.parentNode && mainEl.parentNode === wrapper) {
      wrapper.parentNode.insertBefore(mainEl, wrapper);
      wrapper.remove();
    }
    wrapper = null;

    return canvas;
  } finally {
    if (wrapper != null) {
      try {
        if (mainEl.parentNode === wrapper && wrapper.parentNode) {
          wrapper.parentNode.insertBefore(mainEl, wrapper);
          wrapper.remove();
        } else if (wrapper.parentNode) {
          wrapper.remove();
        }
      } catch {
        /* */
      }
      wrapper = null;
    }
    document.body.removeAttribute('data-capture');
  }
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

let _uid = 0;
const uid = () => String(++_uid);
const makeRow = (): BusinessRow => ({ id: uid(), industryCode: '', totalRevenue: '', totalExpenses: '' });

let _customItemUid = 0;
const nextCustomExpenseId = () => String(++_customItemUid);

let _nyUid = 0;
const makeNyRow = (): BusinessRow => ({ id: `ny${++_nyUid}`, industryCode: '', totalRevenue: '', totalExpenses: '' });

function bumpUidFromRowIds(ids: string[]) {
  for (const id of ids) {
    const n = parseInt(id, 10);
    if (!Number.isNaN(n)) _uid = Math.max(_uid, n);
  }
}

function bumpNyUidFromNyRowIds(ids: string[]) {
  for (const id of ids) {
    const m = /^ny(\d+)$/.exec(id);
    if (m) _nyUid = Math.max(_nyUid, parseInt(m[1], 10));
  }
}

// ── 메인 컴포넌트 ──────────────────────────────────────────
export default function Home() {
  const [taxpayer, setTaxpayer]     = useState('');   // 소득자
  const [prevYear, setPrevYear]     = useState('');   // 전기 연도
  const [currYear, setCurrYear]     = useState('');   // 당기 연도
  const [rows, setRows]             = useState<BusinessRow[]>([makeRow()]);
  const [allRates, setAllRates]     = useState<Record<string, IndustryRate>>({});
  const [analyzed, setAnalyzed]     = useState(false);
  /** 입력이 바뀐 뒤에는 이전 분석 결과가 최신이 아님을 안내 */
  const [analysisStale, setAnalysisStale] = useState(false);
  const [ratesReloadKey, setRatesReloadKey] = useState(0);
  const [industryRatesStatus, setIndustryRatesStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const [analyzeBlockReason, setAnalyzeBlockReason] = useState<string | null>(null);
  const [rowDetails, setRowDetails] = useState<Record<string, RowDetail>>({});
  const [printExpDetail, setPrintExpDetail] = useState(false);
  const [printInputExpenseDetail, setPrintInputExpenseDetail] = useState(false);
  const [nyRows, setNyRows] = useState<BusinessRow[]>(() => [makeNyRow()]);
  const [nyRowDetails, setNyRowDetails] = useState<Record<string, RowDetail>>({});
  const [nyAnalyzed, setNyAnalyzed] = useState(false);
  const [nyPrintExpDetail, setNyPrintExpDetail] = useState(false);
  const [nyDetailSectionOpen, setNyDetailSectionOpen] = useState(false);
  const [nyRemarks, setNyRemarks] = useState('');
  const [saving, setSaving] = useState<'pdf' | 'jpg' | null>(null);
  const [persistReady, setPersistReady] = useState(false);
  const simSnapRef = useRef<SimPersist | null>(null);
  const [simPersist, setSimPersist] = useState<SimPersist | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIndustryRatesStatus('loading');
    setRatesLoadError(null);
    loadIndustryRates()
      .then(data => {
        if (cancelled) return;
        setAllRates(data);
        setIndustryRatesStatus('ok');
      })
      .catch(e => {
        if (cancelled) return;
        setAllRates({});
        setIndustryRatesStatus('error');
        setRatesLoadError(e instanceof Error ? e.message : '업종코드 데이터를 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [ratesReloadKey]);

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
      setAnalysisStale(false);
      setPrintExpDetail(!!m.printExpDetail);
      setPrintInputExpenseDetail(!!m.printInputExpenseDetail);
      if (Array.isArray(m.nyRows) && m.nyRows.length > 0) {
        bumpNyUidFromNyRowIds(m.nyRows.map(r => r.id));
        setNyRows(m.nyRows as BusinessRow[]);
      }
      if (m.nyRowDetails && typeof m.nyRowDetails === 'object') {
        const nyd = m.nyRowDetails as Record<string, RowDetail>;
        setNyRowDetails(nyd);
        bumpNyCustomUidFromRowDetails(nyd);
      }
      setNyAnalyzed(!!m.nyAnalyzed);
      setNyPrintExpDetail(!!m.nyPrintExpDetail);
      if (typeof m.nyDetailSectionOpen === 'boolean') setNyDetailSectionOpen(m.nyDetailSectionOpen);
      if (typeof m.nyRemarks === 'string') setNyRemarks(m.nyRemarks);
    } catch {
      /* ignore */
    }
    setPersistReady(true);
  }, []);

  // 시뮬 스냅샷: 시뮬 섹션 마운트 전에도 LS_SIM으로 당기 명세 동기화 가능하게
  useEffect(() => {
    if (!persistReady || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LS_SIM);
      if (!raw) return;
      const p = JSON.parse(raw) as SimPersist;
      setSimPersist(p);
      simSnapRef.current = p;
    } catch {
      /* ignore */
    }
  }, [persistReady]);

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
          nyRows,
          nyRowDetails,
          nyAnalyzed,
          nyPrintExpDetail,
          nyDetailSectionOpen,
          nyRemarks,
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
    nyRows,
    nyRowDetails,
    nyAnalyzed,
    nyPrintExpDetail,
    nyDetailSectionOpen,
    nyRemarks,
  ]);

  const onSimSnapshot = useCallback((s: SimPersist) => {
    simSnapRef.current = s;
    setSimPersist(s);
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
      nyRows,
      nyRowDetails,
      nyAnalyzed,
      nyPrintExpDetail,
      nyDetailSectionOpen,
      nyRemarks,
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
    if (analyzed) setAnalysisStale(true);
    if (field === 'totalRevenue') setAnalyzeBlockReason(null);
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

  const handleAnalyze = () => {
    const hasRevenue = rows.some(r => toNum(r.totalRevenue) > 0);
    if (!hasRevenue) {
      setAnalyzeBlockReason('총수입금액 칸에 1원 이상 숫자를 입력한 뒤 다시 눌러 주세요. (경비만 넣으면 분석할 수 없습니다.)');
      return;
    }
    setAnalyzeBlockReason(null);
    setAnalysisStale(false);
    setAnalyzed(true);
  };
  const handleReset = () => {
    try {
      localStorage.removeItem(LS_MAIN);
      localStorage.removeItem(LS_SIM);
    } catch {
      /* */
    }
    simSnapRef.current = null;
    _uid = 0;
    _customItemUid = 0;
    _nyUid = 0;
    resetNyCustomItemUid();
    setRows([makeRow()]);
    setAnalyzed(false);
    setAnalysisStale(false);
    setTaxpayer('');
    setPrevYear('');
    setCurrYear('');
    setRowDetails({});
    setPrintExpDetail(false);
    setPrintInputExpenseDetail(false);
    setNyRows([makeNyRow()]);
    setNyRowDetails({});
    setNyAnalyzed(false);
    setNyPrintExpDetail(false);
    setNyDetailSectionOpen(false);
    setNyRemarks('');
    setAnalyzeBlockReason(null);
    setRatesReloadKey(k => k + 1);
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

  const computed   = rows.map(r => computeRow(r, allRates, toNum));
  const activeRows = computed.filter(c => c.revNum > 0);
  const canAnalyze = rows.some(r => toNum(r.totalRevenue) > 0);
  const totalRev   = computed.reduce((s, r) => s + r.revNum, 0);
  const totalExp   = computed.reduce((s, r) => s + r.expNum, 0);
  const totalNet   = totalRev - totalExp;
  const totalRate  = totalRev > 0 ? (totalNet / totalRev) * 100 : 0;
  const totalBaseIncome =
    computed.reduce((s, r) => s + r.baseIncome, 0);
  const totalBaseIncomeRate =
    totalRev > 0 ? (totalBaseIncome / totalRev) * 100 : 0;
  const totalPastStdRatio =
    totalBaseIncome > 0 ? (totalNet / totalBaseIncome) * 100 : 0;
  const totalIncomeRateDiff = totalRate - totalBaseIncomeRate;

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  // 상세분석이 입력된 행이 있는지 확인
  const hasAnyExpDetail = rows.some(r => sumExpenseInputs(getDetail(r.id), toNum) > 0);

  const getNyDetail = (id: string): RowDetail => {
    const raw = nyRowDetails[id];
    if (!raw) return { show: false, expenses: initExpenses(), customDefs: [] };
    return {
      show: raw.show,
      customDefs: raw.customDefs ?? [],
      expenses: mergeDetailExpenses(raw),
    };
  };
  const nyComputed = nyRows.map(r => computeRow(r, allRates, toNum));
  const nyActiveRows = nyComputed.filter(c => c.revNum > 0);
  const nyHasAnyExpDetail = nyRows.some(r => sumExpenseInputs(getNyDetail(r.id), toNum) > 0);
  const showPrevExpDetailPrint = analyzed && printExpDetail && hasAnyExpDetail;
  const showNyExpDetailPrint =
    nyDetailSectionOpen && nyAnalyzed && nyPrintExpDetail && nyHasAnyExpDetail;
  const prevYearPrintPrefix = prevYear.trim() ? `${prevYear.trim()}년 ` : '';

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

      {/* 인쇄·PDF·JPG: 기재한 경우에만 특이사항 블록 출력 */}
      {nyRemarks.trim() && (
        <div className="print-only hidden px-2 mb-2 no-break rounded-lg border border-gray-300 bg-gray-50 py-2">
          <p className="text-[10px] font-bold text-gray-600 mb-1">특이사항</p>
          <p className="text-[10px] text-gray-800 whitespace-pre-wrap leading-snug">{nyRemarks}</p>
        </div>
      )}

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

        {industryRatesStatus === 'loading' && (
          <div className="no-print rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-2.5 text-xs text-blue-800 flex flex-wrap items-center justify-between gap-2">
            <span>
              업종코드·단순경비율 데이터를 불러오는 중입니다… (수십 초 걸리면 브라우저 캐시 문제일 수 있습니다. 아래를 누르거나 <strong className="font-bold">F5</strong>로 새로고침해 보세요.)
            </span>
            <button
              type="button"
              onClick={() => setRatesReloadKey(k => k + 1)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-800">
              다시 시도
            </button>
          </div>
        )}
        {industryRatesStatus === 'error' && ratesLoadError && (
          <div className="no-print rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong className="font-bold">업종 데이터 오류.</strong> {ratesLoadError} 분석 시 업종 매칭이 되지 않습니다. 네트워크 확인 후 아래를 눌러 주세요.
            </span>
            <button
              type="button"
              onClick={() => setRatesReloadKey(k => k + 1)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-bold hover:bg-red-800">
              다시 불러오기
            </button>
          </div>
        )}

        {/* ── 입력 테이블 (인쇄 제외) ── */}
        <div className="no-print bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-800">
                {prevYear.trim() ? `${prevYear.trim()}년 ` : ''}총수입금액 및 필요경비 명세
              </h2>
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
                  const hasDetail = sumExpenseInputs(detail, toNum) > 0;
                  const expTotal = sumExpenseInputs(detail, toNum);
                  const expDiff  = c.expNum - expTotal;
                  const expDenom = c.expNum > 0 ? c.expNum : expTotal > 0 ? expTotal : 0;

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
                                  소득 {formatPct(matched.simpleRateGeneral === null ? null : 100 - matched.simpleRateGeneral)}
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
                                  const revRatio = c.revNum > 0 && num > 0 ? (num / c.revNum) * 100 : null;
                                  const expRatio = expDenom > 0 && num > 0 ? (num / expDenom) * 100 : null;
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
                                      {num <= 0 ? (
                                        <span className="shrink-0 w-10 text-gray-300 text-center text-[10px]">-</span>
                                      ) : (
                                        <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[3.35rem]">
                                          {revRatio !== null && (
                                            <span className="text-[10px] font-bold text-amber-700 leading-tight">매출 {revRatio.toFixed(1)}%</span>
                                          )}
                                          {expRatio !== null && (
                                            <span className="text-[10px] font-bold text-indigo-700 leading-tight">경비 {expRatio.toFixed(1)}%</span>
                                          )}
                                        </div>
                                      )}
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
                                  const revRatio = c.revNum > 0 && num > 0 ? (num / c.revNum) * 100 : null;
                                  const expRatio = expDenom > 0 && num > 0 ? (num / expDenom) * 100 : null;
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
                                      {num <= 0 ? (
                                        <span className="shrink-0 w-10 text-gray-300 text-center text-[10px]">-</span>
                                      ) : (
                                        <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[3.35rem]">
                                          {revRatio !== null && (
                                            <span className="text-[10px] font-bold text-amber-700 leading-tight">매출 {revRatio.toFixed(1)}%</span>
                                          )}
                                          {expRatio !== null && (
                                            <span className="text-[10px] font-bold text-indigo-700 leading-tight">경비 {expRatio.toFixed(1)}%</span>
                                          )}
                                        </div>
                                      )}
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
              type="button"
              onClick={handleAnalyze}
              className={`relative z-10 w-full cursor-pointer py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] transition-all shadow text-sm ${
                canAnalyze ? '' : 'opacity-90'
              }`}
            >
              분석하기
            </button>
            {analyzeBlockReason && (
              <p className="mt-2.5 text-xs text-red-600 font-semibold text-center leading-snug" role="alert">
                {analyzeBlockReason}
              </p>
            )}
            {!canAnalyze && !analyzeBlockReason && (
              <p className="mt-2 text-[11px] text-gray-500 text-center leading-snug">
                위 표에서 <span className="text-blue-700 font-semibold">총수입금액</span>에 숫자를 넣으면 분석할 수 있습니다.
              </p>
            )}
          </div>
        </div>

        {/* ── 분석 결과 ── */}
        {analyzed && (
          <>
            {/* ── 분석 섹션 래퍼 (시뮬레이션과 동일 스타일) ── */}
            <div className="space-y-4 bg-orange-50/30 rounded-3xl border border-orange-100 p-5 shadow-sm">

            <div className="analysis-section-print-top space-y-4">
            {/* 제목 — 인쇄에도 화면과 동일(체크박스만 제외) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-8 bg-gradient-to-b from-orange-400 to-amber-500 rounded-full shrink-0" />
                <h2 className="text-2xl font-black tracking-tight analysis-screen-title">
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
                  <span className="text-xs font-bold text-amber-700">{prevYearPrintPrefix}항목별 비율분석 인쇄에 포함</span>
                </label>
              )}
            </div>

            {/* 전체 합계 — 업종별 카드보다 위 */}
            {activeRows.length >= 2 && (
              <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-5 no-break print-summary-total">
                <h3 className="text-sm font-bold text-gray-700 mb-4 print-summary-total-heading">
                  전체 합계 분석{prevYear.trim() ? ` (${prevYear.trim()}년)` : ''}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-blue-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-blue-500 mb-1.5">총수입금액 합계</p>
                    <p className="text-base font-bold text-blue-700 font-mono">{formatKRW(totalRev)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-orange-500 mb-1.5">필요경비 합계</p>
                    <p className="text-base font-bold text-orange-600 font-mono">{formatKRW(totalExp)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatPct(totalRev > 0 ? (totalExp / totalRev) * 100 : 0)}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-green-600 mb-1.5">소득금액 합계</p>
                    <p className="text-base font-bold text-green-700 font-mono">{formatKRW(totalNet)}</p>
                    <p className="text-xs text-green-600 font-bold mt-0.5">{formatPct(totalRate)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 print-summary-total-cell">
                    <p className="text-xs text-gray-500 mb-1.5">단순경비율 기준 소득금액 합계</p>
                    <p className="text-base font-bold text-gray-800 font-mono">{formatKRW(totalBaseIncome)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatPct(totalBaseIncomeRate)}</p>
                  </div>
                </div>
                {totalBaseIncome > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-100">
                    <IncomeRateStandardCompareBlock
                      incomeRate={totalRate}
                      baseIncomeRate={totalBaseIncomeRate}
                      incomeRateDiff={totalIncomeRateDiff}
                      pastStdRatio={totalPastStdRatio}
                    />
                  </div>
                )}
              </div>
            )}
            </div>{/* analysis-section-print-top */}

            {analysisStale && (
              <div className="no-print rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                <strong className="font-bold">입력이 변경되었습니다.</strong> 아래 숫자는 이전 분석 기준입니다. 반영하려면 위에서 <strong>분석하기</strong>를 다시 눌러 주세요.
              </div>
            )}

            {/* 업종별 분석 카드 */}
            <div className="grid gap-3">
              {activeRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-orange-200 bg-white/80 px-6 py-10 text-center text-sm text-gray-600">
                  <p className="font-bold text-gray-800 mb-1">표시할 분석 행이 없습니다</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    이 영역에는 <strong className="text-orange-700">총수입금액</strong>을 1원 이상 입력한 행만 나옵니다.
                    수입만 비워 두고 경비만 넣으면 여기는 비어 보일 수 있습니다. 수입 금액을 입력한 뒤 다시 <strong>분석하기</strong>를 눌러 주세요.
                  </p>
                </div>
              ) : (
              activeRows.map((c, idx) => {
                const detail  = getDetail(c.id);
                const hasExp  = sumExpenseInputs(detail, toNum) > 0;
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
                      <IncomeRateStandardCompareBlock
                        incomeRate={c.incomeRate}
                        baseIncomeRate={c.baseIncomeRate}
                        incomeRateDiff={c.incomeRateDiff}
                        pastStdRatio={c.pastStdRatio}
                      />
                    )}

                    {/* 항목별 비율분석 (입력된 경우) */}
                    {hasExp && (
                      <div className={`border-t border-amber-100 pt-2 mt-1 ${expPrintClass}`}>
                        <p className="text-[10px] font-bold text-amber-700 mb-1.5">필요경비 항목별 매출·필요경비 내 비율</p>
                        <ExpenseRatioTable
                          expMap={detail.expenses}
                          revenue={c.revNum}
                          necessaryExpense={c.expNum}
                          printClass=""
                          extraDefs={extraExpenseDefs}
                        />
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>

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
              detailAnalysisNeeded={nyDetailSectionOpen}
              onDetailAnalysisNeededChange={setNyDetailSectionOpen}
              nyRemarks={nyRemarks}
              onNyRemarksChange={setNyRemarks}
            />

            {nyDetailSectionOpen && (
            <NextYearPlanSection
              allRates={allRates}
              currYear={currYear}
              taxpayer={taxpayer}
              makeNyRow={makeNyRow}
              rows={nyRows}
              setRows={setNyRows}
              rowDetails={nyRowDetails}
              setRowDetails={setNyRowDetails}
              analyzed={nyAnalyzed}
              setAnalyzed={setNyAnalyzed}
              printExpDetail={nyPrintExpDetail}
              setPrintExpDetail={setNyPrintExpDetail}
              simulationSnapshot={simPersist}
            />
            )}
          </>
        )}
      </div>

      {/* ── 인쇄 부속: 전기 항목별 비율분석 → 이어서 당기 ── */}
      {showPrevExpDetailPrint && (
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
              const hasExp = sumExpenseInputs(detail, toNum) > 0;
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
                  <ExpenseRatioTable
                    expMap={detail.expenses}
                    revenue={c.revNum}
                    necessaryExpense={c.expNum}
                    printClass=""
                    extraDefs={extraExpenseDefs}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNyExpDetailPrint && (
        <div
          className={`print-only hidden px-2 pt-2 ${showPrevExpDetailPrint ? 'exp-detail-follow-ny' : 'exp-detail-page'}`}>
          <div className="mb-3 pb-2 border-b-2 border-red-600">
            <h2 className="text-lg font-black text-gray-900">
              {taxpayer && <span className="text-blue-900">{taxpayer} </span>}
              {currYear.trim() && <span className="text-red-600">{currYear.trim()}년 </span>}
              필요경비 항목별 매출 대비 비율분석
            </h2>
          </div>
          <div className="space-y-4">
            {nyActiveRows.map((c, idx) => {
              const detail = getNyDetail(c.id);
              const hasExp = sumExpenseInputs(detail, toNum) > 0;
              if (!hasExp) return null;
              const extraExpenseDefs = (detail.customDefs ?? []).map(x => ({
                key: customExpenseKey(x.id),
                label: x.label || '추가항목',
              }));
              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 no-break">
                  <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-100">
                    <span className="text-xs font-black text-gray-800 font-mono">#{idx + 1} {c.industryCode}</span>
                    {c.industryRate && <span className="text-xs text-gray-500">{c.industryRate.name}</span>}
                    <span className="ml-auto text-xs text-gray-400 font-mono">총수입: {formatKRW(c.revNum)}</span>
                  </div>
                  <ExpenseRatioTable
                    expMap={detail.expenses}
                    revenue={c.revNum}
                    necessaryExpense={c.expNum}
                    printClass=""
                    extraDefs={extraExpenseDefs}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
