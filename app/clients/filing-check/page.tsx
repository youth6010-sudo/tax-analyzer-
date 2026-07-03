'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalPageShell, { PortalPageHeader } from '../../components/portal/PortalPageShell';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import {
  portalAlertInfo,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalStickyBar,
} from '../../components/portal/uiClasses';
import {
  getClientDouzoneCode,
  MANAGER_DISPLAY_ORDER,
  UNCategorized,
} from '@/app/utils/clientsGrouping';
import { useLocalStorage } from '@/app/tools/notice-generator/_lib/useLocalStorage';
import {
  FILING_TAXES,
  VAT_PHASES,
  defaultPeriod,
  extractSpecialFilings,
  filingTargets,
  getCycle,
  isVatSummaryOnlyClient,
  normalizeBizNo,
  parseHometaxFile,
  parsePeriodKey,
  periodKey,
  periodLabel,
  previousPeriodKey,
  specialFilingKey,
  usesMonthOverMonthCompare,
  withholdingTargetsForPeriod,
  type FilingPeriod,
  type FilingTaxId,
  type SpecialFiling,
  type VatPhase,
} from '@/app/utils/filingCheck';
import { hydratePortal, patchPortalClient, usePortalClients } from '@/app/utils/portalStore';
import type { ClientRecord } from '@/app/types/client';
import { compareWithholdingMonths, compareSessionTargets } from '@/lib/filingPeriodCompare';
import {
  formatResidentNoDisplay,
  groupComprehensiveFilingTargets,
  compareComprehensiveGroups,
  type ComprehensiveFilingGroup,
} from '@/lib/comprehensiveFilingGroups';
import { prevWithholdingPeriodKey } from '@/lib/periodUtils';
import type { FilingCheckSessionData } from '@/lib/taxFilingChecksDb';
import {
  resetReceiptOnly,
} from '@/app/utils/filingCheckStorage';
import FilingCheckSessionPanel from '@/app/components/clients/FilingCheckSessionPanel';
import ClientFilingSettingsModal from '@/app/components/clients/ClientFilingSettingsModal';
import IncomeTypeFilingSection, {
  type IncomeFilingStats,
  type IncomeStatFilter,
  type IncomeTypeFilingHandle,
} from '@/app/components/clients/IncomeTypeFilingSection';
import { PortalLoading } from '@/app/components/portal/PortalPageShell';

// 신고대상확인에서 직접 추가한 업체(수임처 DB에 없는 임시 대상)
type ManualClient = {
  id: string;
  companyName: string;
  businessNo: string;
  representative?: string;
};

function manualToClient(m: ManualClient): ClientRecord {
  return {
    id: m.id,
    taxTypes: [],
    businessEntityType: '',
    serviceTypes: [],
    manager: '',
    companyName: m.companyName,
    representative: m.representative ?? '',
    businessNo: m.businessNo,
    corporateNo: '',
    residentNo: '',
    phone: '',
    mobilePhone: '',
    fax: '',
    status: 'active',
    assignedUserId: null,
    intakeStep: 0,
    intakeData: {},
    source: 'manual_intake',
    feeSummary: null,
    program: '',
    converted: false,
    colbert: false,
    createdAt: '',
    updatedAt: '',
  };
}

const isManualId = (id: string) => id.startsWith('manual:');

/** 신고유형 — 당월 / 전월 (레거시 차월 → 전월) */
function readFilingType(intakeData: Record<string, unknown> | undefined): '당월' | '전월' {
  const raw = String(intakeData?.filingType ?? '').trim();
  if (raw === '전월' || raw === '차월') return '전월';
  return '당월';
}

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20';

// 신고때마다 저장하는 단위 데이터
type CheckRecord = {
  overrides: Record<string, boolean>; // 수동 체크 오버라이드
  excelBizNos: string[]; // 홈택스 접수목록 사업자번호(10자리)
  fileName: string;
  diffReason: string;
  done: boolean;
  specialFilings: SpecialFiling[]; // 자동 감지된 수정·기한후 신고
  specialReasons: Record<string, string>; // 특이신고별 사유 (key = bizNo|type)
  excluded: Record<string, string>; // 신고목록 제외 (clientId → 제외사유)
  rowNotes: Record<string, string>; // 업체별 신고 특이사항 (clientId → 메모)
  extraClients: ManualClient[]; // 직접 추가한 업체 (다음 신고 때 자동 승계)
  siteDone?: Record<string, boolean>; // 종소세 사업장별 작업 완료
};

const EMPTY_RECORD: CheckRecord = {
  overrides: {},
  excelBizNos: [],
  fileName: '',
  diffReason: '',
  done: false,
  specialFilings: [],
  specialReasons: {},
  excluded: {},
  rowNotes: {},
  extraClients: [],
};

// localStorage — 연말정산 원천세 이력 스캔용 prefix만 유지
const STORAGE_PREFIX = 'filingCheck:v2:';
const ALL_MANAGERS = '전체';

function managerPrefix(manager: string): string {
  return `${STORAGE_PREFIX}${manager}:`;
}

function TruncateWithTooltip({
  text,
  title,
  className,
}: {
  text: string;
  title?: string;
  className?: string;
}) {
  return (
    <span className={`min-w-0 truncate ${className ?? ''}`} title={title ?? text}>
      {text}
    </span>
  );
}

function ComprehensiveGroupReceiveCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
    />
  );
}

function StatCard({
  label,
  value,
  tone,
  selected,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const cls = `rounded-2xl border px-4 py-3 text-left transition-shadow ${tone} ${
    selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''
  } ${onClick ? 'cursor-pointer hover:shadow-sm' : ''}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        <p className="text-xs font-medium opacity-70">{label}</p>
        <p className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</p>
      </button>
    );
  }
  return (
    <div className={cls}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function FilingBottomStats({
  target,
  received,
  diff,
  unit = '곳',
}: {
  target: number;
  received: number;
  diff: number;
  unit?: '곳' | '건';
}) {
  return (
    <div
      className={`${portalCard} mt-3 flex flex-wrap items-start justify-between gap-3 border-emerald-100 bg-emerald-50/40 px-4 py-3`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">
          총 체크{' '}
          <span className="tabular-nums text-emerald-700">{received}</span>
          <span className="font-normal text-slate-500"> / 신고대상 </span>
          <span className="tabular-nums text-blue-700">{target}</span>
          <span className="font-normal text-slate-500">{unit}</span>
          {diff > 0 && (
            <span className="ml-2 font-medium tabular-nums text-rose-600">
              (차이 {diff}
              {unit})
            </span>
          )}
        </p>
      </div>
      {diff === 0 && target > 0 && (
        <span className="shrink-0 text-xs font-medium text-emerald-700">전체 접수 완료</span>
      )}
    </div>
  );
}

export default function FilingCheckPage() {
  return (
    <Suspense fallback={<PortalLoading label="신고대상확인 불러오는 중…" />}>
      <FilingCheckPageInner />
    </Suspense>
  );
}

function FilingCheckPageInner() {
  const searchParams = useSearchParams();
  const cachedClients = usePortalClients();
  // 신고대상확인은 로그인한 사람과 무관하게 담당자별로 셋팅 → 전체 수임처를 받아 담당자로 가른다.
  const [allClients, setAllClients] = useState<ClientRecord[] | null>(null);
  const clients = allClients ?? cachedClients;
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [incomePanelClient, setIncomePanelClient] = useState<ClientRecord | null>(null);
  const [prevSession, setPrevSession] = useState<FilingCheckSessionData | null>(null);
  // 찰리(관리자)만 담당자 선택 — 일반 담당자는 본인 세션만
  const [storedManager, setStoredManager] = useLocalStorage<string>('filingCheck.manager.v1', '');
  const selManager = useMemo(() => {
    if (isMaster) return storedManager || currentUserName || ALL_MANAGERS;
    return currentUserName?.trim() || '';
  }, [isMaster, storedManager, currentUserName]);

  const [tax, setTax] = useState<FilingTaxId>('withholding');
  const taxFromUrl = searchParams.get('tax');
  useEffect(() => {
    if (!taxFromUrl) return;
    const valid = FILING_TAXES.some(t => t.id === taxFromUrl);
    if (valid) setTax(taxFromUrl as FilingTaxId);
  }, [taxFromUrl]);
  const [period, setPeriod] = useState<FilingPeriod>(() => defaultPeriod());
  const [record, setRecord] = useState<CheckRecord>(EMPTY_RECORD);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const incomeFileRef = useRef<HTMLInputElement>(null);
  const incomeSectionRef = useRef<IncomeTypeFilingHandle>(null);
  const [incomeStats, setIncomeStats] = useState<IncomeFilingStats>({
    target: 0,
    received: 0,
    diff: 0,
    byColumn: [],
  });
  const [incomeParsing, setIncomeParsing] = useState(false);
  const [incomeNotice, setIncomeNotice] = useState('');
  const [incomeUploadMatched, setIncomeUploadMatched] = useState(0);
  const [incomeUploadTotal, setIncomeUploadTotal] = useState(0);
  const [incomeUploadExtra, setIncomeUploadExtra] = useState(0);
  const [employedFilingMonth, setEmployedFilingMonth] = useState(false);
  const [incomeSavedTick, setIncomeSavedTick] = useState(false);
  const incomeSavedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statFilter, setStatFilter] = useState<IncomeStatFilter>('all');
  const [comprehensiveDetail, setComprehensiveDetail] = useState<ComprehensiveFilingGroup | null>(null);

  const cycle = getCycle(tax);
  const isIncomeTypeTax = tax === 'simplePayroll' || tax === 'yearEnd';
  const taxLabel = FILING_TAXES.find(t => t.id === tax)?.label ?? '';
  const keyId = `${managerPrefix(selManager)}${tax}:${periodKey(tax, period)}`;
  const loadedKeyRef = useRef<string>('');

  useEffect(() => {
    setStatFilter('all');
  }, [tax, period.year, period.month, period.vatPhase, selManager]);

  const persistSession = useCallback(
    async (data: CheckRecord) => {
      try {
        const res = await fetch('/api/filing-check/session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manager: selManager,
            taxType: tax,
            periodKey: periodKey(tax, period),
            data,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((body as { error?: string }).error || `저장 실패 (${res.status})`);
        }
        setSaveError('');
        setSavedTick(true);
        if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
        savedTickTimerRef.current = setTimeout(() => setSavedTick(false), 1200);
      } catch (e) {
        setSavedTick(false);
        setSaveError(
          e instanceof Error
            ? e.message
            : '저장에 실패했습니다. 새로고침 후 다시 시도해 주세요.',
        );
      }
    },
    [selManager, tax, period],
  );

  useEffect(() => {
    return () => {
      if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
      if (incomeSavedTickTimerRef.current) clearTimeout(incomeSavedTickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    hydratePortal();
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.user?.name) setCurrentUserName(String(d.user.name).trim());
        if (d?.isMaster) setIsMaster(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const url = isMaster ? '/api/clients' : '/api/clients?mine=1&scope=filing';
    fetch(url, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.clients) setAllClients(d.clients as ClientRecord[]);
      })
      .catch(() => {});
  }, [isMaster]);

  // 세목·기간이 바뀌면 저장된 기록을 불러오고,
  // 저장된 게 없으면 직전 신고 기준으로 무조건 불러온다(특이사항·사유 승계).
  // 단, 접수 자체(엑셀/체크)는 신고분마다 새로 받으므로 가져오지 않는다.
  useEffect(() => {
    if (!selManager) return;
    let cancelled = false;
    const pk = periodKey(tax, period);

    const loadFromServer = async () => {
      try {
        const res = await fetch(
          `/api/filing-check/session?manager=${encodeURIComponent(selManager)}&taxType=${tax}&periodKey=${pk}&withCarry=1`,
          { cache: 'no-store' },
        );
        if (!res.ok) return { data: null as CheckRecord | null, carriedFromPeriodKey: null as string | null };
        const json = (await res.json()) as {
          data?: CheckRecord;
          carriedFromPeriodKey?: string | null;
        };
        return {
          data: json.data ?? null,
          carriedFromPeriodKey: json.carriedFromPeriodKey ?? null,
        };
      } catch {
        return { data: null, carriedFromPeriodKey: null };
      }
    };

    void (async () => {
      const { data: serverRec, carriedFromPeriodKey } = await loadFromServer();
      if (cancelled) return;

      let merged: CheckRecord = serverRec ? { ...EMPTY_RECORD, ...serverRec } : { ...EMPTY_RECORD };

      if (carriedFromPeriodKey) {
        setCarriedFrom(periodLabel(tax, parsePeriodKey(tax, carriedFromPeriodKey)));
      } else {
        setCarriedFrom(null);
      }

      setRecord(merged);
    })();

    loadedKeyRef.current = keyId;
    setParseError('');
    setCopied(false);
    if (fileRef.current) fileRef.current.value = '';
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId, persistSession]);

  // 기록 변경 시 즉시 저장. 완료(done) 상태에서는 완료 취소만 허용.
  const patchRecord = (patch: Partial<CheckRecord>) => {
    setRecord(prev => {
      const unlocking = prev.done && patch.done === false;
      if (prev.done && !unlocking) return prev;
      const next = { ...prev, ...patch };
      void persistSession(next);
      return next;
    });
  };

  // 직전 기간 세션 (전월·직전 신고분 대비)
  useEffect(() => {
    if (!selManager) {
      setPrevSession(null);
      return;
    }
    const pk = periodKey(tax, period);
    const prevPk =
      tax === 'withholding' ? prevWithholdingPeriodKey(pk) : previousPeriodKey(tax, pk);
    if (!prevPk) {
      setPrevSession(null);
      return;
    }
    let cancelled = false;
    void fetch(
      `/api/filing-check/session?manager=${encodeURIComponent(selManager)}&taxType=${tax}&periodKey=${prevPk}`,
      { cache: 'no-store' },
    )
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!cancelled) setPrevSession((d?.data as FilingCheckSessionData) ?? null);
      })
      .catch(() => {
        if (!cancelled) setPrevSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tax, period, selManager]);

  const scopeByManager = useCallback(
    (list: ClientRecord[]) =>
      selManager === ALL_MANAGERS
        ? list
        : list.filter(c => (c.manager?.trim() || UNCategorized) === selManager),
    [selManager],
  );

  const locked = record.done;

  useEffect(() => {
    setIncomeNotice('');
    setIncomeUploadMatched(0);
    setEmployedFilingMonth(false);
  }, [tax, period.year, period.month, selManager]);

  const handleTaxChange = (next: FilingTaxId) => {
    if (next === tax) return;
    setTax(next);
  };

  // 현재 세목 전체 신고대상(담당자 무관) — 담당자별 카운트·필터 기준
  const taxTargetsAll = useMemo(() => {
    if (tax === 'withholding') return withholdingTargetsForPeriod(clients, period.month);
    if (tax === 'simplePayroll') return filingTargets(clients, 'simplePayroll');
    return filingTargets(clients, tax);
  }, [clients, tax, period.month]);

  const periodCompare = useMemo(() => {
    if (!prevSession) return null;
    const pk = periodKey(tax, period);
    const prevPk =
      tax === 'withholding' ? prevWithholdingPeriodKey(pk) : previousPeriodKey(tax, pk);
    if (!prevPk) return null;
    const prevP = parsePeriodKey(tax, prevPk);

    if (tax === 'withholding') {
      return compareWithholdingMonths(clients, prevSession, record, prevP.month, period.month);
    }
    if (tax === 'simplePayroll') {
      const prevTargets = scopeByManager(withholdingTargetsForPeriod(clients, prevP.month));
      const currTargets = scopeByManager(withholdingTargetsForPeriod(clients, period.month));
      return compareSessionTargets(prevTargets, currTargets, prevSession, record);
    }
    if (tax === 'comprehensive') {
      const prevGroups = groupComprehensiveFilingTargets(
        scopeByManager(filingTargets(clients, tax)),
      );
      const currGroups = groupComprehensiveFilingTargets(scopeByManager(taxTargetsAll));
      return compareComprehensiveGroups(prevGroups, currGroups, prevSession, record);
    }

    const prevAll = filingTargets(clients, tax);
    return compareSessionTargets(scopeByManager(prevAll), scopeByManager(taxTargetsAll), prevSession, record);
  }, [tax, period, clients, prevSession, record, scopeByManager, taxTargetsAll]);

  const compareLabels = useMemo(() => {
    if (usesMonthOverMonthCompare(tax)) {
      return {
        title: '전월 대비 신고대상',
        prev: '전월',
        curr: tax === 'simplePayroll' ? '이번 달' : '이번 달',
      };
    }
    const prevPk = previousPeriodKey(tax, periodKey(tax, period));
    const prevLabel = prevPk ? periodLabel(tax, parsePeriodKey(tax, prevPk)) : '직전';
    return {
      title: '직전 신고 대비',
      prev: prevLabel,
      curr: periodLabel(tax, period),
    };
  }, [tax, period]);

  const comprehensiveGroups = useMemo(() => {
    if (tax !== 'comprehensive') return [];
    return groupComprehensiveFilingTargets(scopeByManager(taxTargetsAll));
  }, [tax, taxTargetsAll, scopeByManager]);

  const comprehensiveAllGroupsCount = useMemo(() => {
    if (tax !== 'comprehensive') return 0;
    return groupComprehensiveFilingTargets(taxTargetsAll).length;
  }, [tax, taxTargetsAll]);

  // 담당자 칩 목록(수임처관리와 동일한 표시 순서) + 세목별 대상 수
  const managerCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (tax === 'comprehensive') {
      for (const g of groupComprehensiveFilingTargets(taxTargetsAll)) {
        const k = g.clients[0]?.manager?.trim() || UNCategorized;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    }
    for (const c of taxTargetsAll) {
      const k = c.manager?.trim() || UNCategorized;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [tax, taxTargetsAll]);

  const managerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) set.add(c.manager?.trim() || UNCategorized);
    return [...set].sort((a, b) => {
      if (a === UNCategorized) return 1;
      if (b === UNCategorized) return -1;
      const ia = MANAGER_DISPLAY_ORDER.indexOf(a);
      const ib = MANAGER_DISPLAY_ORDER.indexOf(b);
      const ra = ia >= 0 ? ia : Number.MAX_SAFE_INTEGER;
      const rb = ib >= 0 ? ib : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, 'ko');
    });
  }, [clients]);

  const targets = useMemo(() => {
    const scoped =
      selManager === ALL_MANAGERS
        ? taxTargetsAll
        : taxTargetsAll.filter(c => (c.manager?.trim() || UNCategorized) === selManager);
    const manual = record.extraClients.map(manualToClient);
    return [...scoped, ...manual].sort((a, b) => {
      const ca = getClientDouzoneCode(a);
      const cb = getClientDouzoneCode(b);
      if (ca && cb) {
        const da = ca.replace(/\D/g, '');
        const db = cb.replace(/\D/g, '');
        if (da && db) return parseInt(da, 10) - parseInt(db, 10);
        return ca.localeCompare(cb, 'ko', { numeric: true });
      }
      if (ca) return -1;
      if (cb) return 1;
      return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
    });
  }, [taxTargetsAll, selManager, record.extraClients]);

  const excelSet = useMemo(() => new Set(record.excelBizNos), [record.excelBizNos]);
  const isReceived = (id: string, bizNo: string) =>
    record.overrides[id] ?? excelSet.has(normalizeBizNo(bizNo));

  /** 종소세 접수 — 엑셀 대조(그룹 단위, 상호 작업체크와 무관) */
  const isGroupFilingReceived = (g: ComprehensiveFilingGroup) => {
    if (Object.prototype.hasOwnProperty.call(record.overrides, g.primaryClientId)) {
      return record.overrides[g.primaryClientId];
    }
    const withBiz = g.clients.filter(c => normalizeBizNo(c.businessNo) !== '');
    if (withBiz.length === 0) return false;
    return withBiz.every(c => excelSet.has(normalizeBizNo(c.businessNo)));
  };

  const setGroupFilingReceived = (g: ComprehensiveFilingGroup, checked: boolean) => {
    patchRecord({ overrides: { ...record.overrides, [g.primaryClientId]: checked } });
  };

  /** 종소세 사업장별 작업 완료 — 접수와 별도 */
  const isSiteDone = (clientId: string) => record.siteDone?.[clientId] ?? false;

  const setSiteDone = (clientId: string, checked: boolean) => {
    patchRecord({ siteDone: { ...(record.siteDone ?? {}), [clientId]: checked } });
  };

  const setGroupSiteDone = (g: ComprehensiveFilingGroup, checked: boolean) => {
    const siteDone = { ...(record.siteDone ?? {}) };
    for (const c of g.clients) siteDone[c.id] = checked;
    patchRecord({ siteDone });
  };

  const groupSiteDoneState = (g: ComprehensiveFilingGroup) => {
    const done = g.clients.filter(c => isSiteDone(c.id)).length;
    if (done === 0) return { checked: false, indeterminate: false };
    if (done === g.clients.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  const comprehensiveSiteTooltip = (g: ComprehensiveFilingGroup) =>
    g.clients.map(c => c.companyName || '(상호 없음)').join('\n');
  const isManualExcluded = (id: string) =>
    Object.prototype.hasOwnProperty.call(record.excluded, id);

  // 연말정산: 해당 연도에 원천세 신고이력(접수)이 한 번이라도 있는 업체만 대상.
  // 저장된 원천세 신고분(월별)에서 접수된 사업자번호/업체id를 모은다.
  const withheld = useMemo(() => {
    const bizNos = new Set<string>();
    const ids = new Set<string>();
    if (tax !== 'yearEnd' || typeof window === 'undefined') return { bizNos, ids };
    const prefix = `${managerPrefix(selManager)}withholding:${period.year}-`;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        const rec = JSON.parse(localStorage.getItem(k) || 'null') as CheckRecord | null;
        if (!rec) continue;
        for (const b of rec.excelBizNos ?? []) bizNos.add(normalizeBizNo(b));
        for (const [id, v] of Object.entries(rec.overrides ?? {})) if (v) ids.add(id);
      } catch {
        /* skip */
      }
    }
    return { bizNos, ids };
  }, [tax, period.year, savedTick, selManager]);

  const AUTO_NO_WH = '원천세 신고내역 없음';
  const hasWithholdingHistory = (c: ClientRecord) => {
    const b = normalizeBizNo(c.businessNo);
    return withheld.ids.has(c.id) || (b !== '' && withheld.bizNos.has(b));
  };
  // 제외 사유(수동 제외 우선) — 미제외면 null
  const excludeReasonOf = (c: ClientRecord): string | null => {
    if (isManualExcluded(c.id)) return record.excluded[c.id] ?? '';
    if (tax === 'yearEnd' && !hasWithholdingHistory(c)) return AUTO_NO_WH;
    return null;
  };

  // 제외 처리된 업체는 신고대상에서 빠짐 (수동 제외 + 연말정산 자동 제외)
  const activeTargets = useMemo(
    () => targets.filter(c => excludeReasonOf(c) === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, record.excluded, tax, withheld],
  );
  const excludedTargets = useMemo(
    () => targets.filter(c => excludeReasonOf(c) !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, record.excluded, tax, withheld],
  );

  const isGroupReceived = (g: ComprehensiveFilingGroup) => isGroupFilingReceived(g);

  const activeComprehensiveGroups = useMemo(
    () => comprehensiveGroups.filter(g => excludeReasonOf(g.clients[0]) === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comprehensiveGroups, record.excluded, tax, withheld],
  );
  const excludedComprehensiveGroups = useMemo(
    () => comprehensiveGroups.filter(g => excludeReasonOf(g.clients[0]) !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comprehensiveGroups, record.excluded, tax, withheld],
  );

  const receivedCount =
    tax === 'comprehensive'
      ? activeComprehensiveGroups.filter(g => isGroupReceived(g)).length
      : activeTargets.filter(c => isReceived(c.id, c.businessNo)).length;
  const targetCount =
    tax === 'comprehensive' ? activeComprehensiveGroups.length : activeTargets.length;
  const diff =
    tax === 'comprehensive'
      ? activeComprehensiveGroups.length -
        activeComprehensiveGroups.filter(g => isGroupReceived(g)).length
      : targetCount - receivedCount;
  const notReceived =
    tax === 'comprehensive'
      ? activeComprehensiveGroups.filter(g => !isGroupReceived(g))
      : activeTargets.filter(c => !isReceived(c.id, c.businessNo));
  const excludedTargetsForSummary =
    tax === 'comprehensive'
      ? excludedComprehensiveGroups.map(g => g.clients[0])
      : excludedTargets;

  const toggleStatFilter = useCallback((filter: IncomeStatFilter) => {
    setStatFilter(prev => (prev === filter ? 'all' : filter));
  }, []);

  const displayedComprehensiveGroups = useMemo(() => {
    if (statFilter === 'all') return comprehensiveGroups;
    return comprehensiveGroups.filter(g => {
      const excluded = excludeReasonOf(g.clients[0]) !== null;
      if (statFilter === 'target') return !excluded;
      const received = isGroupReceived(g);
      if (statFilter === 'received') return !excluded && received;
      if (statFilter === 'diff') return !excluded && !received;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comprehensiveGroups, statFilter, record.excluded, tax, withheld]);

  const displayedTargets = useMemo(() => {
    if (statFilter === 'all') return targets;
    return targets.filter(c => {
      const excluded = excludeReasonOf(c) !== null;
      if (statFilter === 'target') return !excluded;
      const received = isReceived(c.id, c.businessNo);
      if (statFilter === 'received') return !excluded && received;
      if (statFilter === 'diff') return !excluded && !received;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, statFilter, record.excluded, record.overrides, excelSet, tax, withheld]);

  const statFilterBanner =
    statFilter !== 'all' ? (
      <p className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        {statFilter === 'target' && '신고대상 업체만 표시 중'}
        {statFilter === 'received' && '접수완료 업체만 표시 중'}
        {statFilter === 'diff' && '미완료(차이) 업체만 표시 중'}
        {' · '}
        <span className="text-blue-600">통계 카드를 다시 클릭하면 전체 보기</span>
      </p>
    ) : null;

  const showIncomeSavedTick = useCallback(() => {
    setIncomeSavedTick(true);
    if (incomeSavedTickTimerRef.current) clearTimeout(incomeSavedTickTimerRef.current);
    incomeSavedTickTimerRef.current = setTimeout(() => setIncomeSavedTick(false), 1200);
  }, []);

  const toggleExclude = (id: string, on: boolean) => {
    const next = { ...record.excluded };
    if (on) next[id] = next[id] ?? '';
    else delete next[id];
    patchRecord({ excluded: next });
  };

  const setExcludeReason = (id: string, reason: string) => {
    patchRecord({ excluded: { ...record.excluded, [id]: reason } });
  };

  const setRowNote = (id: string, note: string) => {
    patchRecord({ rowNotes: { ...record.rowNotes, [id]: note } });
  };

  const setClientFilingType = async (c: ClientRecord, value: '당월' | '전월') => {
    if (isManualId(c.id) || locked) return;
    const prevIntake = c.intakeData ?? {};
    const nextIntake = { ...prevIntake, filingType: value };
    setAllClients(prev =>
      (prev ?? clients).map(x =>
        x.id === c.id ? { ...x, intakeData: nextIntake } : x,
      ),
    );
    patchPortalClient(c.id, { intakeData: nextIntake });
    try {
      const res = await fetch(`/api/clients/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intakeData: nextIntake }),
      });
      if (!res.ok) throw new Error('저장 실패');
    } catch {
      setAllClients(prev =>
        (prev ?? clients).map(x =>
          x.id === c.id ? { ...x, intakeData: prevIntake } : x,
        ),
      );
      patchPortalClient(c.id, { intakeData: prevIntake });
    }
  };

  // 업체 직접 추가
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addBiz, setAddBiz] = useState('');
  const [addRep, setAddRep] = useState('');

  const addManualClient = () => {
    const name = addName.trim();
    if (!name) return;
    const m: ManualClient = {
      id: `manual:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyName: name,
      businessNo: addBiz.trim(),
      representative: addRep.trim() || undefined,
    };
    patchRecord({ extraClients: [...record.extraClients, m] });
    setAddName('');
    setAddBiz('');
    setAddRep('');
  };

  const removeManualClient = (id: string) => {
    const overrides = { ...record.overrides };
    const excluded = { ...record.excluded };
    const rowNotes = { ...record.rowNotes };
    delete overrides[id];
    delete excluded[id];
    delete rowNotes[id];
    patchRecord({
      extraClients: record.extraClients.filter(m => m.id !== id),
      overrides,
      excluded,
      rowNotes,
    });
  };

  const extraCount = useMemo(() => {
    if (excelSet.size === 0) return 0;
    const targetBiz = new Set(targets.map(c => normalizeBizNo(c.businessNo)).filter(Boolean));
    let n = 0;
    for (const b of excelSet) if (!targetBiz.has(b)) n += 1;
    return n;
  }, [excelSet, targets]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    try {
      const { bizNos, filings } = await parseHometaxFile(file);
      const special = extractSpecialFilings(filings);
      // 이전에 적어둔 사유 중 이번에도 존재하는 항목은 보존
      const keptReasons: Record<string, string> = {};
      for (const s of special) {
        const k = specialFilingKey(s.bizNo, s.type);
        if (record.specialReasons[k]) keptReasons[k] = record.specialReasons[k];
      }
      patchRecord({
        excelBizNos: bizNos,
        overrides: {},
        fileName: file.name,
        done: false,
        specialFilings: special,
        specialReasons: keptReasons,
      });
    } catch {
      setParseError('엑셀을 읽지 못했습니다. 홈택스 접수목록 파일(.xlsx/.xls)인지 확인해 주세요.');
    } finally {
      setParsing(false);
    }
  };

  const setSpecialReason = (key: string, value: string) => {
    patchRecord({ specialReasons: { ...record.specialReasons, [key]: value } });
  };

  const summary = useMemo(() => {
    const mgrLabel = selManager === ALL_MANAGERS ? '전체' : selManager;
    const statTarget = isIncomeTypeTax ? incomeStats.target : targetCount;
    const statReceived = isIncomeTypeTax ? incomeStats.received : receivedCount;
    const statDiff = isIncomeTypeTax ? incomeStats.diff : diff;
    const lines = [
      `[신고대상확인] ${taxLabel} · ${periodLabel(tax, period)} · ${mgrLabel}`,
      `· 신고대상: ${statTarget}곳`,
      `· 접수완료: ${statReceived}곳`,
      `· 차이: ${statDiff}곳`,
    ];
    const note = record.diffReason.trim();
    if (statDiff !== 0) {
      lines.push(`· 차이 사유: ${note || '미기재'}`);
    } else if (note) {
      lines.push(`· 특이사항: ${note}`);
    }
    if (record.specialFilings.length > 0) {
      lines.push('· 수정·기한후·경정청구 신고');
      for (const s of record.specialFilings) {
        const reason = record.specialReasons[specialFilingKey(s.bizNo, s.type)]?.trim();
        lines.push(`  - ${s.name || s.bizNo} ${s.type} ${s.count}건${reason ? ` (${reason})` : ''}`);
      }
    }
    if (!isIncomeTypeTax) {
      if (excludedTargetsForSummary.length > 0) {
        lines.push(`· 신고제외 ${excludedTargetsForSummary.length}곳`);
        for (const c of excludedTargetsForSummary) {
          const r = (excludeReasonOf(c) ?? '').trim();
          lines.push(`  - ${c.companyName || c.representative || '(이름없음)'}${r ? ` (${r})` : ''}`);
        }
      }
      const noteTargets = activeTargets.filter(c => (record.rowNotes[c.id] ?? '').trim());
      if (noteTargets.length > 0) {
        lines.push('· 신고 특이사항');
        for (const c of noteTargets) {
          lines.push(`  - ${c.companyName || '(이름없음)'}: ${record.rowNotes[c.id].trim()}`);
        }
      }
      if (notReceived.length > 0) {
        if (tax === 'comprehensive') {
          lines.push(
            `· 미접수: ${(notReceived as ComprehensiveFilingGroup[]).map(g => g.representative).join(', ')}`,
          );
        } else {
          lines.push(
            `· 미접수: ${(notReceived as ClientRecord[]).map(c => c.companyName || '(이름없음)').join(', ')}`,
          );
        }
      }
      if (extraCount > 0) {
        lines.push(`· 접수목록 중 비대상: ${extraCount}건`);
      }
    }
    if (periodCompare) {
      lines.push(
        `· ${compareLabels.title}: ${periodCompare.prevCount}곳 → ${periodCompare.currCount}곳 (${periodCompare.diff >= 0 ? '+' : ''}${periodCompare.diff})`,
      );
      if (periodCompare.changedClients.length > 0) {
        lines.push(`· ${compareLabels.prev}과 다른 업체`);
        for (const c of periodCompare.changedClients) {
          lines.push(
            `  - ${c.companyName}${c.change === 'added' ? ' (추가)' : ' (제외)'}`,
          );
        }
      }
    }
    return lines.join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    taxLabel,
    tax,
    period,
    selManager,
    incomeStats,
    isIncomeTypeTax,
    targetCount,
    receivedCount,
    diff,
    record.diffReason,
    record.specialFilings,
    record.specialReasons,
    record.excluded,
    record.rowNotes,
    activeTargets,
    excludedTargetsForSummary,
    notReceived,
    extraCount,
    withheld,
    periodCompare,
    compareLabels,
  ]);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const mergeHometaxSpecialFilings = async (file: File) => {
    const { bizNos, filings } = await parseHometaxFile(file);
    const special = extractSpecialFilings(filings);
    const keptReasons: Record<string, string> = {};
    for (const s of special) {
      const k = specialFilingKey(s.bizNo, s.type);
      if (record.specialReasons[k]) keptReasons[k] = record.specialReasons[k];
    }
    patchRecord({
      excelBizNos: bizNos,
      specialFilings: special,
      specialReasons: keptReasons,
      fileName: file.name,
    });
  };

  const completionFooter = (diffValue: number) => (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {locked ? (
          <>
            <button
              type="button"
              onClick={() => patchRecord({ done: false })}
              className={portalBtnSecondary}
            >
              완료 취소
            </button>
            <span className="text-xs font-medium text-emerald-700">완료됨 — 수정하려면 완료 취소하세요</span>
          </>
        ) : (
          <>
            <button type="button" onClick={() => patchRecord({ done: true })} className={portalBtnPrimary}>
              완료 처리
            </button>
            {diffValue !== 0 && !record.diffReason.trim() && (
              <span className="text-xs text-rose-500">차이가 있어요. 사유를 적으면 요약에 함께 들어갑니다.</span>
            )}
          </>
        )}
      </div>

      {record.done && (
        <div className={`${portalCard} mt-4 p-4`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">요약 (블루홀 공유용)</h2>
            <button type="button" onClick={() => void copySummary()} className={portalBtnSecondary}>
              {copied ? '복사됨 ✓' : '복사'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {summary}
          </pre>
        </div>
      )}
    </>
  );

  const sessionPanel = (
    <FilingCheckSessionPanel
      tax={tax}
      locked={locked}
      carriedFrom={carriedFrom}
      compareLabel={compareLabels.title}
      periodCompare={periodCompare}
      comparePrevLabel={compareLabels.prev}
      compareCurrLabel={compareLabels.curr}
      record={record}
      parseError={parseError}
      onPatch={patchRecord}
      onSetSpecialReason={setSpecialReason}
    />
  );

  // 안내문구 생성기와 동일하게 2025년부터 10년치
  const years = Array.from({ length: 10 }, (_, i) => 2025 + i);

  return (
    <PortalPageShell>
      <div className={`${portalStickyBar} -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 mb-3 space-y-3`}>
      <PortalPageHeader
        title="신고대상확인"
        description="세목·기간별 신고대상 대비 홈택스 접수 현황을 대조하고 요약을 만듭니다. (신고분별 자동 저장)"
        icon={<PageHeaderIcon name="filing-check" />}
      />

      {saveError && (
        <div className={`${portalAlertInfo} border-red-200 bg-red-50 text-red-800`}>
          {saveError}
        </div>
      )}

      {/* 세목 탭 — 균일 너비, 한 줄 고정 */}
      <div className="mb-4 grid grid-cols-7 gap-2">
        {FILING_TAXES.map(t => {
          const active = t.id === tax;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTaxChange(t.id)}
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-bold transition-all ${
                active
                  ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50'
              }`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 담당자 선택 — 관리자(찰리)만 */}
      {isMaster && (
      <div className={`${portalCard} mb-3 p-3`}>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500">담당자</span>
          <span className="text-[10px] text-slate-400">
            선택한 담당자의 수임처 기준으로 신고리스트가 셋팅됩니다
          </span>
          {currentUserName && (
            <button
              type="button"
              onClick={() => setStoredManager(currentUserName)}
              className={`${portalBtnSecondary} ml-auto !px-2 !py-0.5 text-[11px] ${
                selManager === currentUserName ? '!border-blue-300 !bg-blue-50 !text-blue-700' : ''
              }`}
            >
              내 담당
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {[ALL_MANAGERS, ...managerOptions].map(name => {
            const active = selManager === name;
            const isAll = name === ALL_MANAGERS;
            const count = isAll
              ? tax === 'comprehensive'
                ? comprehensiveAllGroupsCount
                : taxTargetsAll.length
              : (managerCounts.get(name) ?? 0);
            const self = !isAll && name === currentUserName;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setStoredManager(isAll ? ALL_MANAGERS : name)}
                className={[
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {name}
                {self && <span className="text-[9px] font-bold text-blue-500">나</span>}
                <span
                  className={`min-w-[1rem] rounded px-1 py-px text-center text-[10px] font-semibold tabular-nums ${
                    active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* 기간 + 엑셀 업로드 */}
      <div className={`${portalCard} mb-4 flex flex-wrap items-center gap-3 p-4`}>
        <span className="text-sm font-semibold text-slate-700">기간</span>
        <select
          value={period.year}
          onChange={e => setPeriod(p => ({ ...p, year: Number(e.target.value) }))}
          className={inputCls}
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        {cycle === 'month' && (
          <select
            value={period.month}
            onChange={e => setPeriod(p => ({ ...p, month: Number(e.target.value) }))}
            className={inputCls}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        )}
        {cycle === 'vat' && (
          <select
            value={period.vatPhase}
            onChange={e => setPeriod(p => ({ ...p, vatPhase: e.target.value as VatPhase }))}
            className={inputCls}
          >
            {VAT_PHASES.map(ph => (
              <option key={ph} value={ph}>
                {ph}
              </option>
            ))}
          </select>
        )}
        {tax === 'simplePayroll' && employedFilingMonth && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
            근로 반기 신고월
          </span>
        )}

        {isIncomeTypeTax && incomeSavedTick && (
          <span className="text-xs font-medium text-emerald-600">저장됨 ✓</span>
        )}
        {!isIncomeTypeTax && savedTick && (
          <span className="text-xs font-medium text-emerald-600">저장됨 ✓</span>
        )}
        {!isIncomeTypeTax && saveError && (
          <span className="text-xs font-medium text-red-600" title={saveError}>
            저장 실패
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isIncomeTypeTax && record.fileName && (
            <span className="max-w-[12rem] truncate text-xs text-slate-500">{record.fileName}</span>
          )}
          <input
            ref={isIncomeTypeTax ? incomeFileRef : fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (isIncomeTypeTax) {
                setIncomeParsing(true);
                setIncomeNotice('');
                const upload = incomeSectionRef.current?.uploadHometax(f);
                if (!upload) {
                  setIncomeParsing(false);
                  setIncomeNotice('목록을 불러온 뒤 다시 업로드해 주세요.');
                  return;
                }
                void upload
                  .then(({ matched, total, extraCount }) => {
                    setIncomeUploadMatched(matched);
                    setIncomeUploadTotal(total);
                    setIncomeUploadExtra(extraCount);
                    showIncomeSavedTick();
                  })
                  .catch(err => {
                    setIncomeUploadMatched(0);
                    setIncomeUploadTotal(0);
                    setIncomeUploadExtra(0);
                    setIncomeNotice(err instanceof Error ? err.message : '엑셀 처리 실패');
                  })
                  .finally(() => {
                    setIncomeParsing(false);
                    if (incomeFileRef.current) incomeFileRef.current.value = '';
                  });
              } else {
                void handleUpload(f);
              }
            }}
          />
          <button
            type="button"
            onClick={() => (isIncomeTypeTax ? incomeFileRef : fileRef).current?.click()}
            disabled={(isIncomeTypeTax ? incomeParsing : parsing) || locked}
            className={portalBtnSecondary}
          >
            {(isIncomeTypeTax ? incomeParsing : parsing) ? '읽는 중…' : '홈택스 접수목록 업로드'}
          </button>
          {!isIncomeTypeTax &&
            !locked &&
            (excelSet.size > 0 ||
              Object.keys(record.overrides).length > 0 ||
              record.fileName.trim() ||
              record.done) && (
            <button
              type="button"
              onClick={() => {
                patchRecord(resetReceiptOnly(record));
                if (fileRef.current) fileRef.current.value = '';
              }}
              className={portalBtnSecondary}
            >
              접수 초기화
            </button>
          )}
          {isIncomeTypeTax &&
            !locked &&
            (incomeStats.received > 0 || incomeUploadTotal > 0) && (
            <button
              type="button"
              onClick={() => {
                const reset = incomeSectionRef.current?.resetReceipt;
                if (!reset) return;
                void reset()
                  .then(() => {
                    setIncomeUploadMatched(0);
                    setIncomeUploadTotal(0);
                    setIncomeUploadExtra(0);
                    setIncomeNotice('');
                    if (incomeFileRef.current) incomeFileRef.current.value = '';
                    showIncomeSavedTick();
                  })
                  .catch(err => {
                    setIncomeNotice(err instanceof Error ? err.message : '접수 초기화 실패');
                  });
              }}
              className={portalBtnSecondary}
            >
              접수 초기화
            </button>
          )}
        </div>
      </div>
      </div>

      {isIncomeTypeTax ? (
        <>
          {incomeNotice && (
            <p className={`${portalAlertInfo} mb-4`}>{incomeNotice}</p>
          )}
          {sessionPanel}
          <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-md">
            <StatCard
              label="신고대상(건)"
              value={incomeStats.target}
              tone="border-blue-100 bg-blue-50/60 text-blue-800"
              selected={statFilter === 'target'}
              onClick={() => toggleStatFilter('target')}
            />
            <StatCard
              label="접수완료(건)"
              value={incomeStats.received}
              tone="border-emerald-100 bg-emerald-50/60 text-emerald-800"
              selected={statFilter === 'received'}
              onClick={() => toggleStatFilter('received')}
            />
            <StatCard
              label="차이"
              value={incomeStats.diff}
              tone={
                incomeStats.diff === 0
                  ? 'border-slate-100 bg-slate-50 text-slate-600'
                  : 'border-rose-100 bg-rose-50/60 text-rose-700'
              }
              selected={statFilter === 'diff'}
              onClick={() => toggleStatFilter('diff')}
            />
          </div>
          {incomeUploadTotal > 0 && (
            <p className={`${portalAlertInfo} mb-4`}>
              접수목록 {incomeUploadTotal}건을 사업자번호로 대조해 {incomeUploadMatched}건을 자동 체크했습니다.
              {incomeUploadExtra > 0 &&
                ` 이 중 ${incomeUploadExtra}건은 현재 ${taxLabel} 신고대상 수임처와 일치하지 않습니다.`}
            </p>
          )}
          <IncomeTypeFilingSection
            ref={incomeSectionRef}
            mode={tax === 'simplePayroll' ? 'simplePayroll' : 'yearEnd'}
            manager={selManager}
            clients={clients}
            year={period.year}
            month={period.month}
            onYearChange={y => setPeriod(p => ({ ...p, year: y }))}
            onMonthChange={m => setPeriod(p => ({ ...p, month: m }))}
            embedded
            locked={locked}
            rowFilter={statFilter}
            onStatsChange={setIncomeStats}
            onUploadNotice={setIncomeNotice}
            onEmployedFilingMonth={setEmployedFilingMonth}
            onSaved={showIncomeSavedTick}
          />
          {incomeStats.target > 0 &&
            (incomeStats.received > 0 || incomeUploadMatched > 0) && (
            <FilingBottomStats
              target={incomeStats.target}
              received={incomeStats.received}
              diff={incomeStats.diff}
              unit="건"
            />
          )}
          {completionFooter(incomeStats.diff)}
        </>
      ) : (
        <>
      {sessionPanel}

      {/* 현황 */}
      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <StatCard
          label="신고대상"
          value={targetCount}
          tone="border-blue-100 bg-blue-50/60 text-blue-800"
          selected={statFilter === 'target'}
          onClick={() => toggleStatFilter('target')}
        />
        <StatCard
          label="접수완료"
          value={receivedCount}
          tone="border-emerald-100 bg-emerald-50/60 text-emerald-800"
          selected={statFilter === 'received'}
          onClick={() => toggleStatFilter('received')}
        />
        <StatCard
          label="차이"
          value={diff}
          tone={diff === 0 ? 'border-slate-100 bg-slate-50 text-slate-600' : 'border-rose-100 bg-rose-50/60 text-rose-700'}
          selected={statFilter === 'diff'}
          onClick={() => toggleStatFilter('diff')}
        />
      </div>

      {statFilterBanner}

      {excelSet.size > 0 && (
        <p className={`${portalAlertInfo} mb-4`}>
          접수목록 {excelSet.size}건을 사업자번호로 대조했습니다.
          {extraCount > 0 && ` 이 중 ${extraCount}건은 현재 ${taxLabel} 신고대상 수임처와 일치하지 않습니다.`}
        </p>
      )}

      {/* 업체 직접 추가 */}
      {!locked && (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAdd(v => !v)}
          className={portalBtnSecondary}
        >
          {showAdd ? '닫기' : '+ 업체 추가'}
        </button>
        {showAdd && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addManualClient();
              }}
              placeholder="업체명"
              className={inputCls}
            />
            <input
              value={addBiz}
              onChange={e => setAddBiz(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addManualClient();
              }}
              placeholder="사업자번호 (선택)"
              className={`${inputCls} tabular-nums`}
            />
            <input
              value={addRep}
              onChange={e => setAddRep(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addManualClient();
              }}
              placeholder="대표자 (선택)"
              className={inputCls}
            />
            <button
              type="button"
              onClick={addManualClient}
              disabled={!addName.trim()}
              className={`${portalBtnPrimary} disabled:opacity-40`}
            >
              추가
            </button>
            <span className="text-xs text-slate-400">추가한 업체는 다음 신고 때 자동으로 따라옵니다.</span>
          </div>
        )}
      </div>
      )}

      {/* 대상 목록 */}
      <div className={`${portalCard} overflow-hidden`}>
        {tax === 'comprehensive' ? (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">접수</th>
              <th className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">순번</th>
              <th className="w-20 whitespace-nowrap px-2 py-2 text-left font-semibold">코드</th>
              <th className="w-28 whitespace-nowrap px-2 py-2 text-left font-semibold">대표자명</th>
              <th className="w-32 whitespace-nowrap px-2 py-2 text-left font-semibold">주민등록번호</th>
              <th className="w-48 whitespace-nowrap px-2 py-2 text-left font-semibold">상호</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">특이사항(제외사유 등)</th>
              <th className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">제외</th>
            </tr>
          </thead>
          <tbody>
            {comprehensiveGroups.length === 0 && record.extraClients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                  {taxLabel} 신고대상 수임처가 없습니다.
                </td>
              </tr>
            ) : (
              <>
                {displayedComprehensiveGroups.map((g, i) => {
                  const primary = g.clients[0];
                  const manualExcluded = isManualExcluded(g.primaryClientId);
                  const reason = excludeReasonOf(primary);
                  const excluded = reason !== null;
                  const received = !excluded && isGroupFilingReceived(g);
                  const siteState = groupSiteDoneState(g);
                  const restCount = g.clients.length - 1;
                  const siteLabel = g.displayCompanyLabel;
                  return (
                    <tr
                      key={g.groupKey}
                      className={`border-b border-slate-50 ${
                        excluded ? 'bg-slate-50/70' : received ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={received}
                          disabled={excluded || locked}
                          onChange={e => setGroupFilingReceived(g, e.target.checked)}
                          className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
                          title="홈택스 접수목록(엑셀) 대조"
                        />
                      </td>
                      <td className="px-2 py-2 text-center text-xs tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2 tabular-nums text-slate-500">{g.douzoneCode || '-'}</td>
                      <td className="px-2 py-2 font-semibold text-slate-800">{g.representative}</td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600">
                        {formatResidentNoDisplay(g.residentNo)}
                      </td>
                      <td className="max-w-0 px-2 py-2">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                          <ComprehensiveGroupReceiveCheckbox
                            checked={siteState.checked}
                            indeterminate={siteState.indeterminate}
                            disabled={excluded || locked}
                            onChange={checked => setGroupSiteDone(g, checked)}
                          />
                          <TruncateWithTooltip
                            text={siteLabel}
                            title={comprehensiveSiteTooltip(g)}
                            className={
                              excluded
                                ? 'font-medium text-slate-400 line-through'
                                : siteState.checked
                                  ? 'font-medium text-emerald-700'
                                  : 'font-medium text-slate-800'
                            }
                          />
                          {restCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setComprehensiveDetail(g)}
                              disabled={excluded}
                              className="shrink-0 text-xs font-semibold text-blue-600 hover:underline disabled:cursor-default disabled:opacity-50"
                              title={comprehensiveSiteTooltip(g)}
                            >
                              외 {restCount}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={
                            manualExcluded
                              ? (record.excluded[g.primaryClientId] ?? '')
                              : (record.rowNotes[g.primaryClientId] ?? '')
                          }
                          onChange={e =>
                            manualExcluded
                              ? setExcludeReason(g.primaryClientId, e.target.value)
                              : setRowNote(g.primaryClientId, e.target.value)
                          }
                          readOnly={locked}
                          placeholder={manualExcluded ? '제외 사유 (예: 폐업·무실적)' : '신고 특이사항'}
                          className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none ${
                            locked ? 'cursor-default opacity-80' : ''
                          } ${
                            manualExcluded
                              ? 'border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/40'
                              : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'
                          }`}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={excluded}
                          disabled={locked}
                          onChange={e => toggleExclude(g.primaryClientId, e.target.checked)}
                          className="h-4 w-4 accent-slate-400 disabled:opacity-40"
                          title="신고목록에서 제외"
                        />
                      </td>
                    </tr>
                  );
                })}
                {record.extraClients.map((m, mi) => {
                  const c = manualToClient(m);
                  const manualExcluded = isManualExcluded(c.id);
                  const reason = excludeReasonOf(c);
                  const excluded = reason !== null;
                  const received = !excluded && isReceived(c.id, c.businessNo);
                  const rowNo = displayedComprehensiveGroups.length + mi + 1;
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-slate-50 ${
                        excluded ? 'bg-slate-50/70' : received ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={received}
                          disabled={excluded || locked}
                          onChange={e =>
                            patchRecord({
                              overrides: { ...record.overrides, [c.id]: e.target.checked },
                            })
                          }
                          className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-2 py-2 text-center text-xs tabular-nums text-slate-400">{rowNo}</td>
                      <td className="px-2 py-2 tabular-nums text-slate-500">-</td>
                      <td className="px-2 py-2 font-semibold text-slate-800">{c.representative || c.companyName}</td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600">
                        {formatResidentNoDisplay(c.residentNo)}
                      </td>
                      <td className="max-w-0 px-2 py-2">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={isSiteDone(c.id)}
                            disabled={excluded || locked}
                            onChange={e => setSiteDone(c.id, e.target.checked)}
                            className="h-3.5 w-3.5 shrink-0 accent-emerald-500 disabled:opacity-30"
                          />
                          <TruncateWithTooltip
                            text={c.companyName || '(이름 없음)'}
                            className={
                              excluded
                                ? 'text-slate-400 line-through'
                                : isSiteDone(c.id)
                                  ? 'text-emerald-700'
                                  : 'text-slate-800'
                            }
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={manualExcluded ? (record.excluded[c.id] ?? '') : (record.rowNotes[c.id] ?? '')}
                          onChange={e =>
                            manualExcluded
                              ? setExcludeReason(c.id, e.target.value)
                              : setRowNote(c.id, e.target.value)
                          }
                          readOnly={locked}
                          placeholder={manualExcluded ? '제외 사유' : '신고 특이사항'}
                          className={`w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none ${
                            locked ? 'cursor-default opacity-80' : 'focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'
                          }`}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={excluded}
                          disabled={locked}
                          onChange={e => toggleExclude(c.id, e.target.checked)}
                          className="h-4 w-4 accent-slate-400"
                        />
                      </td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
        ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">접수</th>
              <th className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">순번</th>
              <th className="w-20 whitespace-nowrap px-2 py-2 text-left font-semibold">코드</th>
              <th className="w-64 whitespace-nowrap px-2 py-2 text-left font-semibold">업체명</th>
              <th className="w-32 whitespace-nowrap px-2 py-2 text-left font-semibold">사업자번호</th>
              {tax === 'withholding' && (
                <th className="w-28 whitespace-nowrap px-2 py-2 text-center font-semibold">신고유형</th>
              )}
              <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">특이사항(제외사유 등)</th>
              <th className="w-12 whitespace-nowrap px-2 py-2 text-center font-semibold">제외</th>
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 ? (
              <tr>
                <td colSpan={tax === 'withholding' ? 8 : 7} className="px-3 py-10 text-center text-slate-400">
                  {taxLabel} 신고대상 수임처가 없습니다.
                </td>
              </tr>
            ) : (
              displayedTargets.map((c, i) => {
                const manualExcluded = isManualExcluded(c.id);
                const reason = excludeReasonOf(c);
                const excluded = reason !== null;
                const autoExcluded = excluded && !manualExcluded; // 연말정산: 원천세 이력 없음
                const received = !excluded && isReceived(c.id, c.businessNo);
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-50 ${
                      excluded ? 'bg-slate-50/70' : received ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={received}
                        disabled={excluded || locked}
                        onChange={e =>
                          patchRecord({
                            overrides: { ...record.overrides, [c.id]: e.target.checked },
                          })
                        }
                        className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-2 py-2 text-center text-xs tabular-nums text-slate-400">{i + 1}</td>
                    <td className="px-2 py-2 tabular-nums text-slate-500">{getClientDouzoneCode(c) || '-'}</td>
                    <td className="px-2 py-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {isManualId(c.id) ? (
                          <span
                            className={`break-words font-semibold ${
                              excluded ? 'text-slate-400 line-through decoration-slate-400' : 'text-slate-800'
                            }`}
                          >
                            {c.companyName || '(이름 없음)'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIncomePanelClient(c)}
                            className={`break-words text-left font-semibold hover:underline ${
                              excluded
                                ? 'text-slate-400 line-through decoration-slate-400'
                                : 'text-slate-800 hover:text-blue-600'
                            }`}
                            title="클릭 — 간이지급·연말정산지급명세서 신고대상 설정"
                          >
                            {c.companyName || '(이름 없음)'}
                          </button>
                        )}
                        {c.representative && (
                          <span className="shrink-0 text-xs text-slate-400">{c.representative}</span>
                        )}
                        {tax === 'vat' && isVatSummaryOnlyClient(c) && (
                          <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            합계표제출
                          </span>
                        )}
                        {isManualId(c.id) && !locked && (
                          <>
                            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                              직접추가
                            </span>
                            <button
                              type="button"
                              onClick={() => removeManualClient(c.id)}
                              className="shrink-0 text-xs text-slate-400 hover:text-rose-500"
                              title="추가한 업체 삭제"
                            >
                              삭제
                            </button>
                          </>
                        )}
                        {isManualId(c.id) && locked && (
                          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                            직접추가
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600">{c.businessNo || '-'}</td>
                    {tax === 'withholding' && (
                      <td className="px-2 py-2 text-center">
                        {isManualId(c.id) ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <div
                            className={`inline-flex rounded-lg border p-0.5 text-[11px] font-bold ${
                              locked ? 'opacity-60' : ''
                            } border-slate-200 bg-slate-50`}
                          >
                            {(['당월', '전월'] as const).map(opt => {
                              const active = readFilingType(c.intakeData) === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={locked}
                                  onClick={() => void setClientFilingType(c, opt)}
                                  className={`rounded-md px-2 py-0.5 transition-colors ${
                                    active
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-800'
                                  } disabled:cursor-default`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-2">
                      {autoExcluded ? (
                        <span className="inline-block truncate text-xs font-medium text-slate-400">
                          {reason}
                        </span>
                      ) : (
                        <input
                          value={manualExcluded ? (record.excluded[c.id] ?? '') : (record.rowNotes[c.id] ?? '')}
                          onChange={e =>
                            manualExcluded
                              ? setExcludeReason(c.id, e.target.value)
                              : setRowNote(c.id, e.target.value)
                          }
                          readOnly={locked}
                          placeholder={manualExcluded ? '제외 사유 (예: 폐업·무실적)' : '신고 특이사항'}
                          className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none ${
                            locked ? 'cursor-default opacity-80' : ''
                          } ${
                            manualExcluded
                              ? 'border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/40'
                              : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20'
                          }`}
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={excluded}
                        disabled={autoExcluded || locked}
                        onChange={e => toggleExclude(c.id, e.target.checked)}
                        className="h-4 w-4 accent-slate-400 disabled:opacity-40"
                        title={autoExcluded ? '원천세 신고내역이 없어 자동 제외' : '신고목록에서 제외'}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        )}
      </div>

      {excelSet.size > 0 && (
        <FilingBottomStats target={targetCount} received={receivedCount} diff={diff} />
      )}

      {completionFooter(diff)}
        </>
      )}

      {comprehensiveDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setComprehensiveDetail(null)}
        >
          <div
            className={`${portalCard} max-h-[80vh] w-full max-w-md overflow-auto p-5`}
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">{comprehensiveDetail.representative}</h3>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {formatResidentNoDisplay(comprehensiveDetail.residentNo)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComprehensiveDetail(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              소속 사업장 {comprehensiveDetail.clients.length}곳 — 사업장별 작업 완료
            </p>
            <ul className="space-y-2">
              {comprehensiveDetail.clients.map(c => {
                const done = isSiteDone(c.id);
                const name = c.companyName || '(상호 없음)';
                return (
                  <li
                    key={c.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      done
                        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                        : 'border-slate-100 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <label className="flex min-w-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={locked}
                        onChange={e => setSiteDone(c.id, e.target.checked)}
                        className="h-4 w-4 shrink-0 accent-emerald-500 disabled:opacity-30"
                      />
                      <TruncateWithTooltip text={name} className="min-w-0 flex-1 font-medium" />
                      {c.businessNo && (
                        <span className="shrink-0 text-xs text-slate-400 tabular-nums">{c.businessNo}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            {comprehensiveDetail.clients.every(c => isSiteDone(c.id)) && (
              <p className="mt-3 text-center text-xs font-medium text-emerald-600">
                모든 사업장 작업 완료
              </p>
            )}
          </div>
        </div>
      )}

      {incomePanelClient && (
        <ClientFilingSettingsModal
          clientId={incomePanelClient.id}
          companyName={incomePanelClient.companyName || '(이름 없음)'}
          canEdit={!locked}
          onClose={() => setIncomePanelClient(null)}
          onSaved={() => {
            const url = isMaster ? '/api/clients' : '/api/clients?mine=1&scope=filing';
            fetch(url, { cache: 'no-store' })
              .then(r => (r.ok ? r.json() : null))
              .then(d => {
                if (d?.clients) setAllClients(d.clients as ClientRecord[]);
              })
              .catch(() => {});
          }}
        />
      )}
    </PortalPageShell>
  );
}
