'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalAlertInfo,
  portalBtnPrimary,
  portalBtnSecondary,
} from '@/app/components/portal/uiClasses';
import { computeInterimClosing, computeOwnerTaxBases } from '@/lib/interimClosingEngine';
import { buildInterimClosingPdfBlob } from '@/lib/interimClosingExport';
import type {
  AccountLine,
  InterimClosingManualInputs,
  InterimClosingPayload,
  StatementKind,
} from '@/lib/interimClosingTypes';
import {
  STATEMENT_KIND_LABELS,
  STATEMENT_KINDS,
  defaultManualInputs,
  depreciationManualField,
  emptyPayload,
  entityTypeFromClient,
  needsDepreciationCurrentInput,
  needsEndingInventoryInput,
  normalizeAssumptionRow,
  remainingAssumptionMonths,
  syncAssumptionsWithReport,
} from '@/lib/interimClosingTypes';
import { useIsMasterUser } from '@/app/utils/useIsMasterUser';

type ClientOption = {
  id: string;
  companyName: string;
  manager?: string;
  businessEntityType?: string;
  category?: string;
};

type SaveListItem = {
  id: string;
  companyName: string;
  year: number;
  baseMonth: number;
  manager: string;
  savedBy: string;
  savedAt: string;
};

const cellIn =
  'w-full border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums outline-none hover:border-[#8faadc] focus:border-[#001f60] focus:bg-[#f3f7fc]';
const cellInLeft =
  'w-full border border-transparent bg-transparent px-1 py-0.5 text-center outline-none hover:border-[#8faadc] focus:border-[#001f60] focus:bg-[#f3f7fc]';
const sheetNum = 'border border-[#c5d0e0] bg-white px-1.5 py-0.5 text-right tabular-nums';
const sheetLabel =
  'border border-[#c5d0e0] bg-[#f3f6fa] px-1.5 py-0.5 text-center text-[11px] font-medium text-[#001f60]';
/** 직접 입력 칸 — 연한 하늘색(자동계산 흰 칸과 구분) */
const sheetInput = 'border border-[#c5d0e0] bg-[#eef4fb] p-0';
const sheetSelect =
  'w-full rounded-none border border-[#c5d0e0] bg-[#eef4fb] px-0.5 py-0.5 text-[10px] outline-none focus:border-[#001f60]';
const sheetSection =
  'bg-[#001f60] px-2 py-1 text-center text-[11px] font-bold text-white';
const sheetTotal = 'bg-[#d6e6f5]';
const sheetEmph = 'bg-[#e8f1fa] font-bold text-[#001f60]';
/** KPI 핵심행 — 남색 라벨·굵은 글씨 (추가 테두리 없음) */
const sheetKpiLab = 'border border-[#c5d0e0] bg-[#001f60] px-1.5 py-0.5 text-center text-[11px] font-bold text-white';
const sheetKpiVal =
  'border border-[#c5d0e0] bg-white px-1.5 py-0.5 text-right font-bold tabular-nums text-[#001f60]';
/** 가정치 월 입력 */
const assumeInput = 'border border-[#c5d0e0] bg-[#eef4fb] p-0';
/** 본표 열 구분선 (전기·당기·과목 동일) */
const colRule = 'border-[#9aa8bc]';
const colRuleL = `border-l ${colRule}`;
const colRuleR = `border-r ${colRule}`;
/** 당기순이익·재고조정 표 공통 2열 */
const KPI_COLGROUP = (
  <colgroup>
    <col style={{ width: '42%' }} />
    <col style={{ width: '58%' }} />
  </colgroup>
);
/** 성실판정·전년도·조정사항 공통 2열 (라벨 열 위아래 맞춤) */
const MID_COLGROUP = (
  <colgroup>
    <col style={{ width: '42%' }} />
    <col style={{ width: '58%' }} />
  </colgroup>
);
/** 12월환산·세금추정 — 라벨 열 동일 비율 */
const RIGHT_LABEL_PCT = '42%';
const RIGHT_COLGROUP_2 = (
  <colgroup>
    <col style={{ width: RIGHT_LABEL_PCT }} />
    <col style={{ width: '58%' }} />
  </colgroup>
);
const RIGHT_COLGROUP_3 = (
  <colgroup>
    <col style={{ width: RIGHT_LABEL_PCT }} />
    <col style={{ width: '40%' }} />
    <col style={{ width: '18%' }} />
  </colgroup>
);

/** 본표 11열 — 상단 섹션·본표 colgroup 공통 (선택|코드|과목|전기×2|당기×3|환산×3)
 *  입력/환산기준은 한 줄, 금액은 상대적으로 축소 — 합계 고정 */
const REPORT_COL_WEIGHTS = [1.2, 2.2, 8.5, 7.0, 2.9, 7.0, 2.9, 3.8, 7.0, 2.9, 3.8] as const;
const REPORT_COL_SUM = REPORT_COL_WEIGHTS.reduce((a, b) => a + b, 0);
const REPORT_COL_FR = REPORT_COL_WEIGHTS.map(w => `${w}fr`).join(' ');
const REPORT_COL_PCT = REPORT_COL_WEIGHTS.map(w => `${((w / REPORT_COL_SUM) * 100).toFixed(4)}%`);

const thMain =
  'whitespace-nowrap border border-[#9aa8bc] bg-[#001f60] px-1 py-1 text-center font-bold text-white';
const thSub =
  'whitespace-nowrap border border-[#9aa8bc] bg-[#001f60] px-0.5 py-0.5 text-center text-[10px] font-semibold text-white';
/** 상단 패널 — 여백 유지, 섹션 구분선만 열에 맞춤 */
const panelPad = 'space-y-2 p-2';
const panelPadFlex = 'flex h-full min-h-0 flex-col gap-2 p-2';

function formatWrittenAt(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${base.getFullYear()}.${String(base.getMonth() + 1).padStart(2, '0')}.${String(base.getDate()).padStart(2, '0')}`;
}

function formatWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? '0' : '';
  return Math.round(n).toLocaleString('ko-KR');
}

function formatPct(r: number | null): string {
  if (r == null || !Number.isFinite(r)) return '';
  return `${(r * 100).toFixed(1)}%`;
}

function parseWonInput(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function MoneyCell({
  value,
  onChange,
  className = '',
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : value ? formatWon(value) : '';
  return (
    <input
      className={`${cellIn} ${className}`}
      value={display}
      inputMode="decimal"
      onFocus={e => {
        setDraft(value ? String(value) : '');
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => {
        const n = parseWonInput(draft ?? '');
        onChange(n);
        setDraft(null);
      }}
      onChange={e => {
        const raw = e.target.value;
        setDraft(raw);
        onChange(parseWonInput(raw));
      }}
    />
  );
}

export default function InterimClosingPageClient() {
  const isMaster = useIsMasterUser();
  const [payload, setPayload] = useState<InterimClosingPayload>(() => emptyPayload());
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saves, setSaves] = useState<SaveListItem[]>([]);
  const [showLoad, setShowLoad] = useState(false);
  const [loadSearch, setLoadSearch] = useState('');
  /** 불러오기 모달에서 지정한 수임처 — 시점 목록만 필터 */
  const [loadCompany, setLoadCompany] = useState<string | null>(null);
  const [loadClientId, setLoadClientId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [bulkInputBasis, setBulkInputBasis] = useState('');
  const [bulkConvertBasis, setBulkConvertBasis] = useState('');
  const [showUpload, setShowUpload] = useState(true);
  const [clientSuggestOpen, setClientSuggestOpen] = useState(false);
  /** 엑셀 P2 전체표시 / P3 해당항목표시 */
  const [rowDisplayMode, setRowDisplayMode] = useState<'matched' | 'all'>('matched');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  /** 작성일 — 저장/불러온 시점 (없으면 오늘) */
  const [writtenAt, setWrittenAt] = useState<string | null>(null);

  const computed = useMemo(() => computeInterimClosing(payload), [payload]);
  const ownerBases = useMemo(() => computeOwnerTaxBases(payload.manual), [payload.manual]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  // 환산기준=가정치 계정 → 가정치 표 자동 연동 (연동된 행만)
  // assumptions를 deps에 넣으면 금액 입력 중 sync가 다시 돌려 입력이 깨짐
  useEffect(() => {
    const source = computed.rows.filter(r => r.linked && (r.name || '').trim());
    setPayload(p => {
      const next = syncAssumptionsWithReport(p.manual.assumptions, source);
      const same =
        next.length === p.manual.assumptions.length &&
        next.every((a, i) => {
          const b = p.manual.assumptions[i]!;
          return (
            a.name === b.name &&
            a.note === b.note &&
            JSON.stringify(a.byMonth || {}) === JSON.stringify(b.byMonth || {})
          );
        });
      if (same) return p;
      return {
        ...p,
        manual: { ...p.manual, assumptions: next },
      };
    });
  }, [computed.rows]);

  // 인디·관리자(전체조회): 전 수임처 / 일반: 내 담당만
  useEffect(() => {
    if (isMaster === null) return;
    const url = isMaster ? '/api/clients' : '/api/clients?mine=1';
    void fetch(url, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d?.clients) ? d.clients : Array.isArray(d) ? d : [];
        setClients(
          list.map(
            (c: {
              id: string;
              companyName?: string;
              manager?: string;
              businessEntityType?: string;
              intakeData?: Record<string, unknown>;
            }) => ({
              id: c.id,
              companyName: c.companyName || '',
              manager: c.manager,
              businessEntityType: c.businessEntityType,
              category: String(c.intakeData?.category ?? ''),
            }),
          ),
        );
      })
      .catch(() => {});
  }, [isMaster]);

  const applyClient = useCallback((c: ClientOption) => {
    const entityType = entityTypeFromClient({
      businessEntityType: c.businessEntityType,
      intakeData: { category: c.category },
    });
    setClientId(c.id);
    setClientQuery(c.companyName);
    setPayload(p => ({
      ...p,
      companyName: c.companyName,
      manual: { ...p.manual, entityType },
    }));
    setClientSuggestOpen(false);
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientQuery.replace(/\s+/g, '').toLowerCase();
    if (!q) return clients.slice(0, 40);
    return clients
      .filter(c => c.companyName.replace(/\s+/g, '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [clients, clientQuery]);

  const patchManual = useCallback((patch: Partial<InterimClosingManualInputs>) => {
    setPayload(p => ({
      ...p,
      manual: { ...p.manual, ...patch },
      baseMonth: patch.baseMonth ?? p.baseMonth,
    }));
  }, []);

  const assumptionMonths = useMemo(
    () => remainingAssumptionMonths(payload.baseMonth),
    [payload.baseMonth],
  );

  const setAssumptionMonth = (idx: number, month: number, value: number) => {
    setPayload(p => {
      const assumptions = p.manual.assumptions.map((a, i) => {
        if (i !== idx) return a;
        const byMonth = { ...(a.byMonth || {}) };
        byMonth[String(month)] = value;
        return { ...a, byMonth };
      });
      return { ...p, manual: { ...p.manual, assumptions } };
    });
  };

  const setAssumptionNote = (idx: number, note: string) => {
    setPayload(p => {
      const assumptions = p.manual.assumptions.map((a, i) =>
        i === idx ? { ...a, note } : a,
      );
      return { ...p, manual: { ...p.manual, assumptions } };
    });
  };

  const removeAssumption = (idx: number) => {
    setPayload(p => ({
      ...p,
      manual: {
        ...p.manual,
        assumptions: p.manual.assumptions.filter((_, i) => i !== idx),
      },
    }));
  };

  const setRowCriteria = (key: string, field: 'inputBasis' | 'convertBasis', value: string) => {
    setPayload(p => ({
      ...p,
      rowCriteria: {
        ...p.rowCriteria,
        [key]: {
          inputBasis: p.rowCriteria[key]?.inputBasis ?? '',
          convertBasis: p.rowCriteria[key]?.convertBasis ?? '',
          [field]: value,
        },
      },
    }));
  };

  const applyBulkCriteria = (field: 'inputBasis' | 'convertBasis', value: string) => {
    if (!value || selectedRowKeys.length === 0) return;
    setPayload(p => {
      const next = { ...p.rowCriteria };
      for (const key of selectedRowKeys) {
        next[key] = {
          inputBasis: next[key]?.inputBasis ?? '',
          convertBasis: next[key]?.convertBasis ?? '',
          [field]: value,
        };
      }
      return { ...p, rowCriteria: next };
    });
    setNotice(`${selectedRowKeys.length}행 ${field === 'inputBasis' ? '입력기준' : '환산기준'} 일괄 변경`);
  };

  const toggleRowSelected = (key: string) => {
    setSelectedRowKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    );
  };

  const onUpload = async (kind: StatementKind, file: File | null) => {
    if (!file) return;
    setError('');
    setBusy(`${STATEMENT_KIND_LABELS[kind]} 파싱 중…`);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('kind', kind);
      const res = await fetch('/api/interim-closing/parse', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '파싱 실패');
      const lines = (data.lines || []) as AccountLine[];
      setPayload(p => ({
        ...p,
        statements: { ...p.statements, [kind]: lines },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패');
    } finally {
      setBusy('');
    }
  };

  const refreshSaves = async (opts?: { companyName?: string; clientId?: string | null }) => {
    const qs = new URLSearchParams();
    const nameHint = (
      opts?.companyName !== undefined
        ? opts.companyName
        : loadCompany || loadSearch || payload.companyName || clientQuery || ''
    ).trim();
    const cid =
      opts?.clientId !== undefined
        ? opts.clientId || ''
        : loadClientId || clientId || '';
    if (nameHint) qs.set('companyName', nameHint);
    if (cid) qs.set('clientId', cid);
    const res = await fetch(`/api/interim-closing/saves?${qs}`, { cache: 'no-store' });
    const data = await res.json();
    let items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0 && !nameHint && !cid) {
      const all = await fetch('/api/interim-closing/saves', { cache: 'no-store' }).then(r => r.json());
      items = Array.isArray(all?.items) ? all.items : [];
    }
    setSaves(items);
  };

  const openLoadDialog = () => {
    const q = (clientQuery || payload.companyName || '').trim();
    setLoadSearch(q);
    if (q || clientId) {
      setLoadCompany(q || null);
      setLoadClientId(clientId || null);
      void refreshSaves({ companyName: q, clientId: clientId || null }).then(() => setShowLoad(true));
    } else {
      setLoadCompany(null);
      setLoadClientId(null);
      setSaves([]);
      setShowLoad(true);
    }
  };

  const pickLoadCompany = (c: { id: string; companyName: string }) => {
    setLoadSearch(c.companyName);
    setLoadCompany(c.companyName);
    setLoadClientId(c.id);
    void refreshSaves({ companyName: c.companyName, clientId: c.id });
  };

  const onDeleteSave = async (id: string, label: string) => {
    if (!confirm(`저장본을 삭제할까요?\n${label}`)) return;
    setBusy('삭제 중…');
    setError('');
    try {
      const res = await fetch(`/api/interim-closing/saves/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '삭제 실패');
      setSaves(prev => prev.filter(s => s.id !== id));
      setNotice('저장본을 삭제했습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy('');
    }
  };

  const onSave = async () => {
    setError('');
    setBusy('저장 중…');
    try {
      // 거래처 미선택 시 회사명으로 매칭
      let resolvedClientId = clientId || null;
      if (!resolvedClientId && payload.companyName.trim()) {
        const hit = clients.find(
          c => c.companyName.replace(/\s+/g, '') === payload.companyName.replace(/\s+/g, ''),
        );
        if (hit) {
          resolvedClientId = hit.id;
          setClientId(hit.id);
        }
      }
      const res = await fetch('/api/interim-closing/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: resolvedClientId,
          companyName: payload.companyName,
          year: payload.year,
          baseMonth: payload.baseMonth,
          payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '저장 실패');
      const savedAt = String(data.saved.savedAt || new Date().toISOString());
      setWrittenAt(savedAt);
      setNotice(`저장됨 · ${new Date(savedAt).toLocaleString('ko-KR')}`);
      await refreshSaves();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy('');
    }
  };

  const onLoad = async (id: string) => {
    setBusy('불러오는 중…');
    setError('');
    try {
      const res = await fetch(`/api/interim-closing/saves/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '불러오기 실패');
      const saved = data.saved;
      const loaded = saved.payload as InterimClosingPayload;
      const assumptions = (loaded.manual?.assumptions || []).map(a => normalizeAssumptionRow(a));
      setPayload({
        ...emptyPayload(loaded.year, loaded.baseMonth),
        ...loaded,
        companyName: loaded.companyName || saved.companyName || '',
        year: loaded.year ?? saved.year,
        baseMonth: loaded.baseMonth ?? saved.baseMonth ?? 6,
        statements: loaded.statements || {},
        manual: {
          ...defaultManualInputs(loaded.baseMonth ?? saved.baseMonth ?? 6),
          ...loaded.manual,
          assumptions,
          specialNotes: loaded.manual?.specialNotes ?? '',
        },
        rowCriteria: loaded.rowCriteria || {},
      });
      if (saved.clientId) setClientId(saved.clientId);
      else {
        const name = String(loaded.companyName || saved.companyName || '').trim();
        const hit = clients.find(c => c.companyName.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
        if (hit) setClientId(hit.id);
      }
      setWrittenAt(String(saved.savedAt || ''));
      setClientQuery(String(loaded.companyName || saved.companyName || ''));
      setShowLoad(false);
      setNotice(`불러옴 · ${new Date(saved.savedAt).toLocaleString('ko-KR')}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setBusy('');
    }
  };

  const displayRows = useMemo(() => {
    // 엑셀 헤더 라벨·하단「세액계산」블록은 본표에서 제외 (세금추정 패널/PDF 하단에서 처리)
    const base = computed.rows.filter(r => {
      const codeCompact = (r.code || '').replace(/\s+/g, '');
      if (r.kind === 'label') {
        if (codeCompact.includes('과목') || r.inputBasis === '입력기준' || r.convertBasis === '환산기준') {
          return false;
        }
        if (codeCompact.includes('세액계산')) return false;
      }
      // 당기순이익(Ⅹ) 이후 세액계산용 sub 행(엑셀 607+)
      if (r.excelRow > 605) return false;
      return true;
    });

    if (rowDisplayMode === 'all') return base;

    // 해당항목표시 = HideRows_IfColumnCEmptyString
    const linkedKeys = new Set(
      base.filter(r => r.linked && (r.kind === 'account' || r.kind === 'sub')).map(r => r.key),
    );
    const hasAnyLinked = linkedKeys.size > 0;
    if (!hasAnyLinked) {
      return base.filter(r => r.isSection || r.kind === 'label');
    }

    const out: typeof base = [];
    for (let i = 0; i < base.length; i++) {
      const row = base[i]!;
      if (row.kind === 'label') {
        out.push(row);
        continue;
      }
      if (row.kind === 'account' || row.kind === 'sub') {
        if (row.linked) out.push(row);
        continue;
      }
      if (row.isSection) {
        let hasChild = false;
        for (let j = i + 1; j < base.length; j++) {
          const n = base[j]!;
          if (n.isSection) break;
          if ((n.kind === 'account' || n.kind === 'sub') && n.linked) {
            hasChild = true;
            break;
          }
        }
        if (hasChild || row.prior !== 0 || row.current !== 0 || row.annualized !== 0) {
          out.push(row);
        }
      }
    }
    return out;
  }, [computed.rows, rowDisplayMode]);

  const selectableKeys = useMemo(
    () =>
      displayRows
        .filter(r => !r.isSection && !r.isComputed && r.kind !== 'label')
        .map(r => r.key),
    [displayRows],
  );
  const allSelectableChecked =
    selectableKeys.length > 0 && selectableKeys.every(k => selectedRowKeys.includes(k));

  const tax = payload.manual.entityType === '개인' ? computed.personalTax : computed.corporateTax;
  const uploadedCount = STATEMENT_KINDS.filter(k => (payload.statements[k]?.length ?? 0) > 0).length;

  const loadClientSuggestions = useMemo(() => {
    if (loadCompany) return [];
    const q = loadSearch.replace(/\s+/g, '').toLowerCase();
    if (!q) return [];
    return clients
      .filter(c => c.companyName.replace(/\s+/g, '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, loadSearch, loadCompany]);

  return (
    <div className="space-y-3 pb-10">
      <PortalPageHeader
        title="가결산"
        description="엑셀 손익분석 보고서와 동일한 시트 화면 · 가정치·환산·조정"
        icon={<PageHeaderIcon name="interim-closing" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={portalBtnSecondary}
              onClick={() => setShowUpload(v => !v)}
            >
              {showUpload ? '업로드 접기' : `명세서 (${uploadedCount})`}
            </button>
            <button
              type="button"
              className={portalBtnSecondary}
              onClick={() => {
                void (async () => {
                  try {
                    setBusy('미리보기 생성 중…');
                    const sheet = document.getElementById('interim-closing-report-sheet');
                    const blob = await buildInterimClosingPdfBlob(payload, computed, sheet, {
                      writtenAt,
                    });
                    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
                    const url = URL.createObjectURL(blob);
                    setPdfPreviewUrl(url);
                    setNotice('');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '미리보기 생성 실패');
                  } finally {
                    setBusy('');
                  }
                })();
              }}
            >
              보고서 출력
            </button>
            <button
              type="button"
              className={portalBtnSecondary}
              onClick={() => openLoadDialog()}
            >
              불러오기
            </button>
            <button type="button" className={portalBtnPrimary} onClick={() => void onSave()} disabled={!!busy}>
              저장
            </button>
          </div>
        }
      />

      {error ? <div className={portalAlertError}>{error}</div> : null}
      {notice ? <div className={portalAlertInfo}>{notice}</div> : null}
      {busy ? <p className="text-sm text-slate-500">{busy}</p> : null}

      {/* 상단 메타 — 엑셀 Q2·회사 헤더 */}
      <div className="flex flex-wrap items-end gap-2 rounded border border-[#c5d0e0] bg-white px-3 py-2 text-xs shadow-sm">
        <div className="relative min-w-[14rem] flex-1">
          <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">수임처 검색</span>
          <input
            className="w-full border border-slate-200 px-2 py-1 font-semibold"
            placeholder={isMaster ? '전체 수임처 상호 검색' : '내 수임처 상호 검색'}
            value={clientQuery}
            onChange={e => {
              const q = e.target.value;
              setClientQuery(q);
              setPayload(p => ({ ...p, companyName: q }));
              if (clientId) {
                const cur = clients.find(c => c.id === clientId);
                if (!cur || cur.companyName !== q) setClientId('');
              }
            }}
            onFocus={() => setClientSuggestOpen(true)}
            onBlur={() => {
              // 클릭 선택 전에 닫히지 않도록 살짝 지연
              window.setTimeout(() => setClientSuggestOpen(false), 150);
            }}
          />
          {clientSuggestOpen && filteredClients.length > 0 ? (
            <ul className="absolute left-0 right-0 z-20 mt-0.5 max-h-56 overflow-auto border border-[#c5d0e0] bg-white shadow-lg">
              {filteredClients.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`flex w-full px-2 py-1.5 text-left hover:bg-emerald-50 ${
                      c.id === clientId ? 'bg-emerald-50 font-semibold' : ''
                    }`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => applyClient(c)}
                  >
                    {c.companyName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label>
          <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">연도</span>
          <input
            type="number"
            className="w-20 border border-slate-200 px-2 py-1 text-right"
            value={payload.year}
            onChange={e => setPayload(p => ({ ...p, year: Number(e.target.value) || p.year }))}
          />
        </label>
        <label>
          <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">기준월(역산)</span>
          <input
            type="number"
            min={1}
            max={12}
            className="w-14 border border-amber-300 bg-amber-50 px-2 py-1 text-center font-bold"
            value={payload.baseMonth}
            onChange={e => {
              const baseMonth = Math.min(12, Math.max(1, Number(e.target.value) || 6));
              setPayload(p => ({
                ...p,
                baseMonth,
                manual: { ...p.manual, baseMonth },
              }));
            }}
          />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className={`border px-2 py-1 text-[11px] font-semibold ${
              rowDisplayMode === 'all'
                ? 'border-slate-700 bg-slate-800 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setRowDisplayMode('all')}
            title="엑셀 전체표시"
          >
            전체표시
          </button>
          <button
            type="button"
            className={`border px-2 py-1 text-[11px] font-semibold ${
              rowDisplayMode === 'matched'
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setRowDisplayMode('matched')}
            title="엑셀 해당항목표시 — 업로드된 계정만"
          >
            해당항목표시
          </button>
        </div>
      </div>

      {showUpload ? (
        <div className="rounded border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700">
              명세서 업로드 (세무사랑 전기대비 계정코드 표시)
            </span>
            <span className="text-[10px] text-slate-500">{uploadedCount}/6 반영</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {STATEMENT_KINDS.map(kind => {
              const n = payload.statements[kind]?.length ?? 0;
              return (
                <label
                  key={kind}
                  className={`cursor-pointer border px-2 py-1.5 ${
                    n ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="mb-0.5 flex justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-slate-700">{STATEMENT_KIND_LABELS[kind]}</span>
                    <span className={n ? 'font-bold text-emerald-700' : 'text-slate-400'}>
                      {n ? `${n}` : '—'}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.csv"
                    className="block w-full text-[10px]"
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      void onUpload(kind, f);
                      e.target.value = '';
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ===== 엑셀 상단 밴드 ===== */}
      <div
        id="interim-closing-report-sheet"
        className="w-full rounded border border-[#9aa8bc] bg-white shadow-sm"
      >
        <div className="border-b border-[#9aa8bc] px-3 py-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="m-0 flex items-center gap-[0.28em] text-lg font-bold leading-none tracking-tight text-[#001f60]">
              <span className="relative top-[-0.12em] inline-flex h-[1.15em] items-center leading-none">
                {payload.year}
              </span>
              <span className="inline-flex h-[1.15em] items-center leading-snug">손익분석 보고서</span>
            </h2>
            <span className="text-[11px] text-slate-500">
              {payload.companyName || '회사명'} · Annual Profit & Loss Overview
            </span>
            <span className="text-[10px] text-slate-500">작성일 : {formatWrittenAt(writtenAt)}</span>
            <span className="ml-auto text-[10px] text-slate-400">(단위 : 원)</span>
          </div>
        </div>

        {/* 상단 3섹션 + 본표: 동일 11열 — 스크롤 공유로 열선 정렬 */}
        <div className="max-h-[min(85vh,1100px)] w-full overflow-auto border-2 border-[#001f60] [scrollbar-gutter:stable]">
          <div
            className="grid w-full border-b border-[#9aa8bc] bg-white"
            style={{ gridTemplateColumns: REPORT_COL_FR }}
          >
            {/* 1. 선택~전기 — KPI·조정·가정치 */}
            <div className={panelPad} style={{ gridColumn: '1 / 6' }}>
              <table className="w-full table-fixed border-collapse text-[11px]">
                {KPI_COLGROUP}
                <tbody>
                  <tr>
                    <td className={`${sheetKpiLab} whitespace-nowrap`}>당기순이익</td>
                    <td className={sheetKpiVal}>{formatWon(computed.kpi.netIncome)}</td>
                  </tr>
                  <tr>
                    <td className={`${sheetKpiLab} whitespace-nowrap`}>영업이익률</td>
                    <td className={sheetKpiVal}>
                      {formatPct(computed.kpi.operatingMargin)}
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetKpiLab} whitespace-nowrap`}>목표영업이익률</td>
                    <td className={`${sheetKpiVal} text-red-600`}>
                      {formatPct(computed.kpi.targetOperatingMargin)}
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetKpiLab} whitespace-nowrap`}>차이조정</td>
                    <td className={sheetKpiVal}>{formatWon(computed.kpi.totalAdj)}</td>
                  </tr>
                  <tr>
                    <td className={`${sheetKpiLab} whitespace-nowrap`}>조정후 이익</td>
                    <td className={sheetKpiVal}>
                      {formatWon(computed.kpi.adjustedProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <table className="w-full table-fixed border-collapse text-[11px]">
                {KPI_COLGROUP}
                <tbody>
                {(
                  [
                    ['inventoryAdj', '재고조정'],
                    ['salesAdj', '매출조정'],
                    ['purchaseAdj', '매입조정'],
                    ['extraCost', '추가인건비'],
                    ['otherCost', '기타비용'],
                    ...(needsEndingInventoryInput(payload.statements) ||
                    payload.manual.endingInventoryCurrent
                      ? ([['endingInventoryCurrent', '기말재고']] as const)
                      : []),
                    ...(needsDepreciationCurrentInput(payload.statements, '618')
                      ? ([['deprConstCurrent', '감가(공사)당기']] as const)
                      : []),
                    ...(needsDepreciationCurrentInput(payload.statements, '818')
                      ? ([['deprSgnaCurrent', '감가(판관)당기']] as const)
                      : []),
                  ] as const
                ).map(([key, label]) => {
                  return (
                  <tr key={key}>
                    <td
                      className={`${sheetLabel} whitespace-nowrap`}
                      title={
                        key === 'endingInventoryCurrent'
                          ? '기말~ 계정은 기본 0원. 당기 기말재고를 여기(또는 본표)에 입력하면 매출원가에 반영됩니다.'
                          : key === 'deprConstCurrent' || key === 'deprSgnaCurrent'
                          ? '명세서 당기가 없어 직접 입력 (본표 당기 칸에서도 입력 가능)'
                          : undefined
                      }
                    >
                      {label}
                    </td>
                    <td className={sheetInput}>
                      <MoneyCell
                        value={payload.manual[key]}
                        onChange={n => patchManual({ [key]: n })}
                      />
                    </td>
                  </tr>
                  );
                })}
                </tbody>
              </table>
              {(needsEndingInventoryInput(payload.statements) &&
                !payload.manual.endingInventoryCurrent) ||
              (needsDepreciationCurrentInput(payload.statements, '618') &&
                !payload.manual.deprConstCurrent) ||
              (needsDepreciationCurrentInput(payload.statements, '818') &&
                !payload.manual.deprSgnaCurrent) ? (
                <p className="px-1 text-[10px] leading-snug text-[#001f60]">
                  {needsEndingInventoryInput(payload.statements) &&
                  !payload.manual.endingInventoryCurrent
                    ? '기말재고는 기본 0원입니다. 당기 기말이 있으면 「기말재고」에 입력하세요. '
                    : null}
                  {(needsDepreciationCurrentInput(payload.statements, '618') &&
                    !payload.manual.deprConstCurrent) ||
                  (needsDepreciationCurrentInput(payload.statements, '818') &&
                    !payload.manual.deprSgnaCurrent)
                    ? '감가상각비는 전기만 있고 당기가 없습니다. 당기 칸에 직접 입력하세요.'
                    : null}
                </p>
              ) : null}

              <div className={sheetSection}>
                가정치
                <span className="ml-1 font-normal opacity-80">(기준월 이후~12월)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-[11px]">
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    {assumptionMonths.map(m => (
                      <col
                        key={m}
                        style={{
                          width: `${((100 - 20 - 26 - 4) / Math.max(1, assumptionMonths.length)).toFixed(3)}%`,
                        }}
                      />
                    ))}
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '4%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#e8f1fa]">
                      <th className="whitespace-nowrap border border-[#c5d0e0] px-1 py-0.5 text-center font-semibold text-[#001f60]">
                        과목
                      </th>
                      {assumptionMonths.map(m => (
                        <th
                          key={m}
                          className="whitespace-nowrap border border-[#c5d0e0] px-0.5 py-0.5 text-center font-semibold text-[#001f60]"
                        >
                          {m}월
                        </th>
                      ))}
                      <th className="whitespace-nowrap border border-[#c5d0e0] px-1 py-0.5 text-center font-semibold text-[#001f60]">
                        산정근거
                      </th>
                      <th className="border border-[#c5d0e0]" />
                    </tr>
                  </thead>
                  <tbody>
                    {payload.manual.assumptions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={assumptionMonths.length + 3}
                          className="border border-[#c5d0e0] px-2 py-2 text-center text-slate-400"
                        >
                          (환산기준 「가정치」 연동 시 표시)
                        </td>
                      </tr>
                    ) : (
                      payload.manual.assumptions.map((a, i) => (
                        <tr key={i}>
                          <td className="whitespace-nowrap border border-[#c5d0e0] bg-white px-1.5 py-0.5 text-left font-medium text-slate-800">
                            {a.name || '—'}
                          </td>
                          {assumptionMonths.map(m => (
                            <td key={m} className={assumeInput}>
                              <MoneyCell
                                value={Number(a.byMonth?.[String(m)] || 0)}
                                onChange={n => setAssumptionMonth(i, m, n)}
                              />
                            </td>
                          ))}
                          <td className={assumeInput}>
                            <input
                              className={cellInLeft}
                              value={a.note}
                              onChange={e => setAssumptionNote(i, e.target.value)}
                              placeholder="직접 입력"
                            />
                          </td>
                          <td className="border border-[#c5d0e0] p-0 text-center">
                            <button
                              type="button"
                              className="px-1 text-slate-400 hover:text-red-600"
                              onClick={() => removeAssumption(i)}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. 당기(금액·비율·입력기준) — 성실판정·전년도·조정·특이 */}
            <div className={`${panelPadFlex} border-l border-[#9aa8bc]`} style={{ gridColumn: '6 / 9' }}>
              <div className={sheetSection}>성실판정</div>
              <table className="w-full table-fixed border-collapse text-[11px]">
                {MID_COLGROUP}
                <tbody>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>개인/법인</td>
                    <td className="border border-[#c5d0e0] bg-white px-1.5 py-0.5 text-center font-semibold text-[#001f60]">
                      {payload.manual.entityType}
                    </td>
                  </tr>
                  {payload.manual.entityType === '개인' ? (
                    <>
                      <tr>
                        <td className={`${sheetLabel} whitespace-nowrap`}>
                          성실기준금액
                          <span className="ml-1 text-[9px] font-normal text-slate-500">(억)</span>
                        </td>
                        <td className={sheetInput}>
                          <input
                            className={cellInLeft}
                            placeholder="예: 7.5"
                            value={payload.manual.sincereThresholdLabel}
                            onChange={e => patchManual({ sincereThresholdLabel: e.target.value })}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className={`${sheetLabel} whitespace-nowrap`}>개인성실판정</td>
                        <td
                          className={`border border-[#c5d0e0] px-1.5 py-0.5 text-center font-bold ${
                            computed.personalSincereFlag === 'Y'
                              ? 'bg-[#e8f1fa] text-[#001f60]'
                              : 'bg-white'
                          }`}
                        >
                          {computed.personalSincereFlag}
                        </td>
                      </tr>
                      <tr>
                        <td className={`${sheetLabel} whitespace-nowrap text-slate-500`}>
                          환산매출(판정용)
                        </td>
                        <td className={`${sheetNum} text-slate-600`}>
                          {formatWon(computed.kpi.salesAnnualized)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td className={`${sheetLabel} whitespace-nowrap`}>법인성실여부</td>
                      <td className={sheetInput}>
                        <select
                          className={`${sheetSelect} text-center`}
                          value={payload.manual.corpSincere}
                          onChange={e => patchManual({ corpSincere: e.target.value as 'Y' | 'N' })}
                        >
                          <option value="N">N</option>
                          <option value="Y">Y</option>
                        </select>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className={sheetSection}>전년도</div>
              <table className="w-full table-fixed border-collapse text-[11px]">
                {MID_COLGROUP}
                <tbody>
                  {(
                    [
                      ['extraExpense', '추가 경비'],
                      ['extraLabor', '추가 인건비'],
                      ['extraBonus', '추가 직원상여'],
                    ] as const
                  ).map(([key, label]) => (
                    <tr key={key}>
                      <td className={`${sheetLabel} whitespace-nowrap`}>{label}</td>
                      <td className={sheetInput}>
                        <MoneyCell value={payload.manual[key]} onChange={n => patchManual({ [key]: n })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={sheetSection}>조정사항 (전기 신고서 기준)</div>
              <table className="w-full table-fixed border-collapse text-[11px]">
                {MID_COLGROUP}
                <tbody>
                  {(
                    payload.manual.entityType === '개인'
                      ? ([
                          ['incomeInclusion', '수입금액산입'],
                          ['expenseInclusion', '필요경비산입'],
                          ['deductionAmount', '소득공제'],
                          ['reductionRate', '감면율'],
                          ['taxCredit', '세액공제'],
                          ['minTaxTarget', '최저한세대상'],
                          ['interimPayment', '중간예납'],
                        ] as const)
                      : ([
                          ['incomeInclusion', '익금산입'],
                          ['expenseInclusion', '손금산입'],
                          ['donationExcess', '기부금한도초과'],
                          ['reductionRate', '감면율'],
                          ['taxCredit', '세액공제'],
                          ['minTaxTarget', '최저한세대상'],
                          ['interimPayment', '중간예납'],
                        ] as const)
                  ).map(([key, label]) => (
                    <tr key={key}>
                      <td className={`${sheetLabel} whitespace-nowrap`}>{label}</td>
                      <td className={sheetInput}>
                        {key === 'reductionRate' ? (
                          <div className="flex items-center gap-0.5 pr-1">
                            <input
                              className={cellIn}
                              value={
                                Number.isFinite(payload.manual.reductionRate)
                                  ? String(Math.round(payload.manual.reductionRate * 1000) / 10)
                                  : ''
                              }
                              onChange={e => {
                                const pct = Number(String(e.target.value).replace(/,/g, '').trim());
                                patchManual({
                                  reductionRate: Number.isFinite(pct) ? pct / 100 : 0,
                                });
                              }}
                            />
                            <span className="shrink-0 text-[10px] font-semibold text-slate-600">%</span>
                          </div>
                        ) : key === 'minTaxTarget' ? (
                          <select
                            className={`${sheetSelect} text-center`}
                            value={payload.manual.minTaxTarget}
                            onChange={e => patchManual({ minTaxTarget: e.target.value as 'Y' | 'N' })}
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
                        ) : (
                          <MoneyCell
                            value={payload.manual[key]}
                            onChange={n => patchManual({ [key]: n })}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={sheetSection}>특이사항</div>
              <div className="flex min-h-0 flex-1 flex-col">
                <textarea
                  className="min-h-[3rem] w-full flex-1 resize-none border border-[#c5d0e0] bg-[#eef4fb] px-2 py-1.5 text-[11px] leading-snug outline-none placeholder:text-slate-400 focus:border-[#001f60]"
                  placeholder="특이사항을 입력하세요"
                  value={payload.manual.specialNotes ?? ''}
                  onChange={e => patchManual({ specialNotes: e.target.value })}
                />
              </div>
            </div>

            {/* 3. 환산(금액·비율·환산기준) — 급여·세액 */}
            {/* 3. 12월환산·대표·세금 추정 */}
            <div className={`${panelPad} border-l border-[#9aa8bc]`} style={{ gridColumn: '9 / 12' }}>
              <div className={sheetSection}>12월 환산 · 추가상여 · 소득공제</div>
              <table className="w-full table-fixed border-collapse text-[11px]">
                {RIGHT_COLGROUP_3}
                <tbody>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>
                      대표급여(
                      <input
                        className="inline-block w-12 border-0 bg-transparent px-0.5 text-center outline-none"
                        value={payload.manual.confirmName}
                        onChange={e => patchManual({ confirmName: e.target.value })}
                        placeholder="성명"
                      />
                      )
                    </td>
                    <td className={sheetInput}>
                      <MoneyCell
                        value={payload.manual.ownerSalaryAnnual}
                        onChange={n => patchManual({ ownerSalaryAnnual: n })}
                      />
                    </td>
                    <td className={`${sheetLabel} whitespace-nowrap text-[10px]`}>12월까지</td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>추가공제</td>
                    <td className={sheetInput} colSpan={2}>
                      <MoneyCell
                        value={payload.manual.ownerDeduction}
                        onChange={n => patchManual({ ownerDeduction: n })}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>추가상여</td>
                    <td className={sheetInput} colSpan={2}>
                      <MoneyCell
                        value={payload.manual.ownerExtraBonus}
                        onChange={n => patchManual({ ownerExtraBonus: n })}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>소득공제</td>
                    <td className={`${sheetNum} ${sheetTotal}`} colSpan={2}>
                      {formatWon(ownerBases.ownerDeduction)}
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>과세표준(세율)</td>
                    <td className={`${sheetNum} ${sheetEmph}`} colSpan={2}>
                      {formatWon(ownerBases.ownerTaxBase)}
                      {ownerBases.ownerRate ? (
                        <span className="font-bold text-red-600">({ownerBases.ownerRate})</span>
                      ) : null}
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>
                      임원급여(
                      <input
                        className="inline-block w-12 border-0 bg-transparent px-0.5 text-center outline-none"
                        value={payload.manual.confirmRole}
                        onChange={e => patchManual({ confirmRole: e.target.value })}
                        placeholder="성명"
                      />
                      )
                    </td>
                    <td className={sheetInput}>
                      <MoneyCell
                        value={payload.manual.execSalaryAnnual}
                        onChange={n => patchManual({ execSalaryAnnual: n })}
                      />
                    </td>
                    <td className={`${sheetLabel} whitespace-nowrap text-[10px]`}>12월까지</td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>추가공제</td>
                    <td className={sheetInput} colSpan={2}>
                      <MoneyCell
                        value={payload.manual.execDeduction}
                        onChange={n => patchManual({ execDeduction: n })}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>추가상여</td>
                    <td className={sheetInput} colSpan={2}>
                      <MoneyCell
                        value={payload.manual.execExtraBonus}
                        onChange={n => patchManual({ execExtraBonus: n })}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>소득공제</td>
                    <td className={`${sheetNum} ${sheetTotal}`} colSpan={2}>
                      {formatWon(ownerBases.execDeduction)}
                    </td>
                  </tr>
                  <tr>
                    <td className={`${sheetLabel} whitespace-nowrap`}>과세표준(세율)</td>
                    <td className={`${sheetNum} ${sheetEmph}`} colSpan={2}>
                      {formatWon(ownerBases.execTaxBase)}
                      {ownerBases.execRate ? (
                        <span className="font-bold text-red-600">({ownerBases.execRate})</span>
                      ) : null}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className={`${sheetSection} mt-3`}>
                {payload.manual.entityType} 세금 추정
              </div>
              <table className="w-full table-fixed border-collapse text-[11px]">
                {RIGHT_COLGROUP_2}
                <tbody>
                  {(
                    payload.manual.entityType === '개인'
                      ? ([
                          { label: '당기순이익', val: tax.netIncome },
                          { label: '수입금액산입', val: tax.incomeInclusion },
                          { label: '필요경비산입', val: tax.expenseInclusion },
                          { label: '소득금액', val: tax.incomeAmount },
                          { label: '소득공제', val: tax.deductionAmount },
                          { label: '과세표준', val: tax.taxBase },
                          { label: '산출세액', val: tax.calculatedTax, rate: tax.rateLabel },
                          { label: '세액감면', val: tax.taxReduction },
                          { label: '세액공제', val: tax.taxCredit },
                          { label: '최저한세', val: tax.minTax },
                          { label: '결정세액', val: tax.determinedTax },
                          { label: '중간예납', val: tax.interimPayment },
                          { label: '차가감납부세액', val: tax.payable },
                        ] as const)
                      : ([
                          { label: '당기순이익', val: tax.netIncome },
                          { label: '익금산입', val: tax.incomeInclusion },
                          { label: '손금산입', val: tax.expenseInclusion },
                          { label: '기부금한도초과', val: tax.donationExcess },
                          { label: '과세표준', val: tax.taxBase },
                          { label: '(*)기본세율', val: null, rate: tax.rateLabel },
                          { label: '산출세액', val: tax.calculatedTax },
                          { label: '세액감면', val: tax.taxReduction },
                          { label: '세액공제', val: tax.taxCredit },
                          { label: '최저한세', val: tax.minTax },
                          { label: '결정세액', val: tax.determinedTax },
                          { label: '중간예납', val: tax.interimPayment },
                          { label: '차가감납부세액', val: tax.payable },
                        ] as const)
                  ).map((row, i, arr) => (
                    <tr key={row.label}>
                      <td className={`${sheetLabel} whitespace-nowrap`}>
                        {'rate' in row && row.rate && row.val != null ? (
                          <>
                            {row.label} (
                            <span className="font-bold text-red-600">{row.rate}</span>)
                          </>
                        ) : (
                          row.label
                        )}
                      </td>
                      <td
                        className={`${sheetNum} ${
                          i === arr.length - 1 ? `${sheetEmph} text-red-600` : ''
                        }`}
                      >
                        {'rate' in row && row.rate && row.val == null ? (
                          <span className="font-bold text-red-600">{row.rate}</span>
                        ) : (
                          formatWon(row.val ?? 0)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 손익분석 보고서 본표 — 상단과 동일 열폭(스크롤 부모 공유) */}
          <div data-report-scroll className="w-full bg-white">
            {selectedRowKeys.length > 0 ? (
              <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-[#c5d0e0] bg-[#e8f1fa] px-2 py-1.5 text-[11px]">
                <span className="font-semibold text-[#001f60]">{selectedRowKeys.length}행 선택</span>
                <label className="flex items-center gap-1">
                  입력기준
                  <select
                    className={sheetSelect}
                    value={bulkInputBasis}
                    onChange={e => setBulkInputBasis(e.target.value)}
                  >
                    <option value="실적">실적</option>
                    <option value="비율">비율</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={portalBtnSecondary}
                  disabled={!bulkInputBasis}
                  onClick={() => {
                    applyBulkCriteria('inputBasis', bulkInputBasis);
                    setBulkInputBasis('');
                  }}
                >
                  일괄적용
                </button>
                <label className="ml-2 flex items-center gap-1">
                  환산기준
                  <select
                    className={sheetSelect}
                    value={bulkConvertBasis}
                    onChange={e => setBulkConvertBasis(e.target.value)}
                  >
                    <option value="">선택</option>
                    <option value="실적">실적</option>
                    <option value="가정치">가정치</option>
                    <option value="역산">역산</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={portalBtnSecondary}
                  disabled={!bulkConvertBasis}
                  onClick={() => {
                    applyBulkCriteria('convertBasis', bulkConvertBasis);
                    setBulkConvertBasis('');
                  }}
                >
                  일괄적용
                </button>
                <button
                  type="button"
                  className="ml-auto text-slate-500 underline"
                  onClick={() => setSelectedRowKeys([])}
                >
                  선택해제
                </button>
              </div>
            ) : null}
            <table className="w-full table-fixed border-collapse text-[11px]">
              <colgroup>
                {REPORT_COL_PCT.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th rowSpan={2} className={`${thMain} px-0.5`}>
                    <input
                      type="checkbox"
                      className="accent-white"
                      checked={allSelectableChecked}
                      onChange={() => {
                        setSelectedRowKeys(allSelectableChecked ? [] : [...selectableKeys]);
                      }}
                      title="표시 계정 전체 선택"
                    />
                  </th>
                  <th rowSpan={2} className={`${thMain} px-0.5`}>
                    코드
                  </th>
                  <th rowSpan={2} className={`${thMain} ${colRuleR} px-0.5`}>
                    과목
                  </th>
                  <th colSpan={2} className={`${thMain} ${colRuleL} ${colRuleR}`}>
                    전기
                  </th>
                  <th colSpan={3} className={`${thMain} ${colRuleL} ${colRuleR}`}>
                    당기 ({payload.baseMonth}월)
                  </th>
                  <th colSpan={3} className={`${thMain} ${colRuleL}`}>
                    환산 (12월까지)
                  </th>
                </tr>
                <tr>
                  <th className={`${thSub} ${colRuleL} ${colRuleR}`}>금액</th>
                  <th className={`${thSub} ${colRuleR}`}>비율</th>
                  <th className={`${thSub} ${colRuleL} ${colRuleR}`}>금액</th>
                  <th className={`${thSub} ${colRuleR}`}>비율</th>
                  <th className={`${thSub} ${colRuleR}`}>입력기준</th>
                  <th className={`${thSub} ${colRuleL} ${colRuleR}`}>금액</th>
                  <th className={`${thSub} ${colRuleR}`}>비율</th>
                  <th className={thSub}>환산기준</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(row => {
                  const isSection = row.isSection;
                  const isLabel = row.kind === 'label';
                  const canPickBasis = !isSection && !isLabel && !row.isComputed;
                  return (
                    <tr
                      key={row.key}
                      className={
                        isSection
                          ? 'bg-[#d6e6f5] font-bold text-[#001f60] [&>td]:bg-clip-padding'
                          : isLabel
                            ? 'bg-[#f3f6fa] font-semibold'
                            : selectedRowKeys.includes(row.key)
                              ? 'bg-[#e8f1fa]'
                              : 'odd:bg-white even:bg-[#f8fafc] hover:bg-[#eef4fb]'
                      }
                    >
                      <td className="border border-slate-200 px-0.5 py-0.5 text-center">
                        {canPickBasis ? (
                          <input
                            type="checkbox"
                            className="accent-[#001f60]"
                            checked={selectedRowKeys.includes(row.key)}
                            onChange={() => toggleRowSelected(row.key)}
                          />
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-1 py-0.5 text-center tabular-nums text-slate-600">
                        {row.code}
                      </td>
                      <td
                        className={`truncate border border-slate-200 ${colRuleR} px-1.5 py-0.5 ${
                          isSection ? 'text-slate-900' : 'text-slate-800'
                        }`}
                      >
                        {row.name}
                      </td>
                      <td className={`whitespace-nowrap border border-slate-200 ${colRuleL} ${colRuleR} px-1 py-0.5 text-right tabular-nums`}>
                        {!isLabel ? formatWon(row.prior) : ''}
                      </td>
                      <td className={`whitespace-nowrap border border-slate-200 ${colRuleR} px-0.5 py-0.5 text-center text-slate-500`}>
                        {!isLabel ? formatPct(row.priorRatio) : ''}
                      </td>
                      <td
                        className={`border border-slate-200 ${colRuleL} ${colRuleR} p-0`}
                      >
                        {(() => {
                          const field = depreciationManualField(row.code);
                          const canEditDepr =
                            !!field &&
                            needsDepreciationCurrentInput(
                              payload.statements,
                              field === 'deprConstCurrent' ? '618' : '818',
                            );
                          const isEndingInv = /기말/.test(String(row.name || '').replace(/\s+/g, ''));
                          if (canEditDepr && field) {
                            return (
                              <MoneyCell
                                value={payload.manual[field] || row.current}
                                onChange={n => patchManual({ [field]: n })}
                              />
                            );
                          }
                          if (isEndingInv && !row.isSection) {
                            return (
                              <MoneyCell
                                value={
                                  payload.manual.endingInventoryCurrent || row.current
                                }
                                onChange={n => patchManual({ endingInventoryCurrent: n })}
                              />
                            );
                          }
                          return (
                            <div className="px-1 py-0.5 text-right tabular-nums">
                              {!isLabel ? formatWon(row.current) : ''}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`whitespace-nowrap border border-slate-200 ${colRuleR} px-0.5 py-0.5 text-center text-slate-500`}>
                        {!isLabel ? formatPct(row.currentRatio) : ''}
                      </td>
                      <td className={`border border-slate-200 ${colRuleR} p-0`}>
                        {canPickBasis ? (
                          <select
                            className={`${sheetSelect} text-center`}
                            value={
                              row.inputBasis === '비율' ? '비율' : '실적'
                            }
                            onChange={e => setRowCriteria(row.key, 'inputBasis', e.target.value)}
                          >
                            <option value="실적">실적</option>
                            <option value="비율">비율</option>
                          </select>
                        ) : null}
                      </td>
                      <td className={`whitespace-nowrap border border-slate-200 ${colRuleL} ${colRuleR} px-1 py-0.5 text-right font-medium tabular-nums text-slate-900${
                        row.convertBasis === '가정치' ? ' bg-[#fff8d1]' : ''
                      }`}>
                        {!isLabel ? formatWon(row.annualized) : ''}
                      </td>
                      <td className={`whitespace-nowrap border border-slate-200 ${colRuleR} px-0.5 py-0.5 text-center text-slate-500${
                        row.convertBasis === '가정치' ? ' bg-[#fff8d1]' : ''
                      }`}>
                        {!isLabel ? formatPct(row.annualizedRatio) : ''}
                      </td>
                      <td className={`border border-slate-200 p-0${
                        row.convertBasis === '가정치' ? ' bg-[#fff8d1]' : ''
                      }`}>
                        {canPickBasis ? (
                          <select
                            className={`${sheetSelect} text-center${
                              row.convertBasis === '가정치' ? ' bg-[#fff8d1]' : ''
                            }`}
                            value={
                              row.convertBasis === '실적' || row.convertBasis === '가정치'
                                ? row.convertBasis
                                : '역산'
                            }
                            onChange={e => setRowCriteria(row.key, 'convertBasis', e.target.value)}
                          >
                            <option value="실적">실적</option>
                            <option value="가정치">가정치</option>
                            <option value="역산">역산</option>
                          </select>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showLoad ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          onClick={() => setShowLoad(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded border border-[#c5d0e0] bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#c5d0e0] px-4 py-3">
              <h3 className="text-sm font-bold text-slate-800">저장 시점으로 불러오기</h3>
              <button type="button" className={portalBtnSecondary} onClick={() => setShowLoad(false)}>
                닫기
              </button>
            </div>
            <div className="shrink-0 space-y-2 border-b border-[#c5d0e0] px-4 py-3">
              {loadCompany ? (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate rounded border border-[#c5d0e0] bg-[#f3f6fa] px-2 py-1.5 text-sm font-medium text-[#001f60]">
                    {loadCompany}
                  </div>
                  <button
                    type="button"
                    className={portalBtnSecondary}
                    onClick={() => {
                      setLoadCompany(null);
                      setLoadClientId(null);
                      setLoadSearch('');
                      setSaves([]);
                    }}
                  >
                    변경
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="w-full border border-[#c5d0e0] px-2 py-1.5 text-sm outline-none focus:border-[#001f60]"
                    placeholder="수임처(회사명) 검색…"
                    value={loadSearch}
                    onChange={e => {
                      const v = e.target.value;
                      setLoadSearch(v);
                      setLoadCompany(null);
                      setLoadClientId(null);
                      if (!v.trim()) setSaves([]);
                    }}
                  />
                  {loadClientSuggestions.length > 0 ? (
                    <div className="max-h-28 overflow-y-auto rounded border border-[#c5d0e0] bg-[#f8fafc]">
                      {loadClientSuggestions.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="block w-full truncate border-b border-[#e8eef5] px-2 py-1.5 text-left text-sm last:border-b-0 hover:bg-[#e8f1fa]"
                          onClick={() => pickLoadCompany(c)}
                        >
                          {c.companyName}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              <p className="text-[11px] text-slate-500">
                {loadCompany
                  ? '저장 시점을 선택하면 해당 데이터만 불러옵니다.'
                  : '수임처를 먼저 지정하세요.'}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
              {!loadCompany ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">
                  수임처를 검색·지정하면 저장 시점이 표시됩니다.
                </p>
              ) : saves.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">
                  해당 수임처의 저장 내역이 없습니다.
                </p>
              ) : (
                <ul>
                  {saves.map(s => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 border-b border-slate-100 px-2 py-2 last:border-b-0"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left hover:opacity-80"
                        onClick={() => void onLoad(s.id)}
                      >
                        <div className="text-sm font-semibold text-slate-800">
                          {new Date(s.savedAt).toLocaleString('ko-KR')}
                        </div>
                        <div className="text-xs text-slate-500">
                          {s.year}년 {s.baseMonth}월 · {s.savedBy || '—'}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
                        title="삭제"
                        onClick={() =>
                          void onDeleteSave(
                            s.id,
                            `${loadCompany} · ${new Date(s.savedAt).toLocaleString('ko-KR')}`,
                          )
                        }
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {pdfPreviewUrl ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="손익분석보고서 미리보기"
          onClick={() => {
            if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
          }}
        >
          <div
            className="flex h-[min(94vh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded border border-[#c5d0e0] bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h3 className="text-sm font-bold text-slate-900">손익분석보고서 미리보기</h3>
              <span className="text-[11px] text-slate-500">엑셀 인쇄 양식과 동일한 A4 PDF</span>
              <button
                type="button"
                className={`ml-auto ${portalBtnSecondary}`}
                onClick={() => {
                  if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
                  setPdfPreviewUrl(null);
                }}
              >
                닫기
              </button>
            </div>
            <iframe
              title="손익분석보고서 미리보기"
              src={pdfPreviewUrl}
              className="min-h-0 flex-1 w-full bg-slate-100"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
