'use client';

import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  MANAGER_DISPLAY_ORDER,
  UNCategorized,
} from '@/app/utils/clientsGrouping';
import {
  applyManagerScopedFilingCheckOrder,
  CLIENT_SORT_STORAGE_KEY,
  commitFilingCheckClientReorder,
  FILING_CHECK_CLIENT_ORDER_STORAGE_KEY,
  filingCheckOrderTaxKey,
  MANAGER_CLIENT_ORDER_STORAGE_KEY,
  MANAGER_ORDER_STORAGE_KEY,
  compareManagersByOrder,
  readFilingCheckClientOrder,
  type ClientSortKey,
} from '@/app/utils/clientListPrefs';
import { useTriangleListReorder } from '@/app/utils/useTriangleListReorder';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { managerChipColor, MANAGER_LEGEND_ORDER } from '@/lib/calendarManagerColors';
import { useLocalStorage } from '@/app/tools/notice-generator/_lib/useLocalStorage';
import ScopeToggle from '@/app/components/portal/ScopeToggle';
import {
  COLUMN_FILTER_EMPTY,
  ColumnFilterMenu,
  ColumnValueFilterHeader,
  buildColumnFilterOptions,
  matchesColumnFilter,
  useColumnFilters,
} from '@/app/components/portal/ColumnValueFilter';
import {
  FILING_TAXES,
  VAT_PHASES,
  CORP_PHASES,
  defaultCorpFilingPeriod,
  defaultPeriod,
  extractSpecialFilings,
  filingTargets,
  getCycle,
  isVatSummaryOnlyClient,
  isSimplifiedVatClient,
  isVatProvisionalPhase,
  isVatFilingObligation,
  isVatNoticeObligation,
  readVatObligation,
  vatObligationBucket,
  vatObligationManagerCounts,
  formatCompanyNameList,
  normalizeBizNo,
  parseHometaxFile,
  parsePeriodKey,
  periodKey,
  periodLabel,
  multiFilingReasonKey,
  specialFilingKey,
  countHometaxFilingsByBiz,
  filingCountForBiz,
  surplusFilingCountForTargets,
  usesMonthOverMonthCompare,
  withholdingTargetsForPeriod,
  simplePayrollTargetsForPeriod,
  isSemiAnnualOffMonthExcluded,
  SEMI_ANNUAL_OFF_MONTH_EXCLUDE_REASON,
  type FilingPeriod,
  type FilingTaxId,
  type SpecialFiling,
  type VatPhase,
  type CorpPhase,
  type VatObligation,
} from '@/app/utils/filingCheck';
import { hydratePortal, patchPortalClient, usePortalClients, getPortalClients } from '@/app/utils/portalStore';
import type { ClientRecord } from '@/app/types/client';
import { filingClosureNotice, isClosedBeforeFilingPeriod } from '@/app/utils/clientClosure';
import { readVatFilingFee, vatProgressPeriodKey } from '@/lib/vatEntryProgress';
import {
  compareWithholdingMonths,
  compareSessionTargets,
  type PeriodCompareResult,
} from '@/lib/filingPeriodCompare';
import {
  formatResidentNoDisplay,
  groupComprehensiveFilingTargets,
  compareComprehensiveGroups,
  type ComprehensiveFilingGroup,
} from '@/lib/comprehensiveFilingGroups';
import { simplePayrollMonthlyPeriodKey, attributionMonthFromReportMonth, reportMonthFromAttributionMonth } from '@/lib/periodUtils';
import { readWithholdingSettings } from '@/lib/incomeTypes';
import type { FilingCheckSessionData } from '@/lib/taxFilingChecksDb';
import {
  hasFilingCarryData,
  readLocalFilingCheckSession,
  resetReceiptOnly,
  writeLocalFilingCheckSession,
} from '@/app/utils/filingCheckStorage';
import FilingCheckSessionPanel from '@/app/components/clients/FilingCheckSessionPanel';
import FilingCheckClientAdd from '@/app/components/clients/FilingCheckClientAdd';
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
  filingType?: '당월' | '전월';
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
    intakeData: m.filingType ? { filingType: m.filingType } : {},
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

type ReviewKeyHint = {
  reviewKey: string;
  reviewName: string;
  owners: string[];
  taxKinds: string[];
  focusOwner?: string;
  focusRow?: number;
};

const ReviewClientIdMapContext = createContext<Record<string, ReviewKeyHint[]> | null>(null);

function ReviewClientIdMapProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Record<string, ReviewKeyHint[]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      fetch('/api/review/client-id-review-map')
        .then(r => r.json())
        .then(data => {
          if (!cancelled) setMap(data.byClientId || {});
        })
        .catch(() => {
          if (!cancelled) setMap({});
        });
    };
    // 첫 페인트 이후 지연 — 수임처·세션 로딩과 경쟁하지 않음
    const t = window.setTimeout(run, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  return (
    <ReviewClientIdMapContext.Provider value={map}>{children}</ReviewClientIdMapContext.Provider>
  );
}

function reviewSheetHrefFromContext(ctx: {
  reviewKey: string;
  owners: string[];
  taxKinds: string[];
  sources?: { owner: string; row?: number }[];
}): string {
  const params = new URLSearchParams();
  const owner = ctx.sources?.[0]?.owner ?? ctx.owners[0];
  if (owner) params.set('owner', owner);
  if (ctx.taxKinds.includes('income')) params.set('tab', 'income');
  else if (ctx.taxKinds.some(k => k === 'corp-tax' || k === 'corp-fee')) params.set('tab', 'corp');
  params.set('focus', ctx.reviewKey);
  return `/clients/review-sheet?${params.toString()}`;
}

function reviewSheetHrefFromHints(
  clientId: string,
  map: Record<string, ReviewKeyHint[]> | null,
): string | null {
  if (!map) return null;
  const hints = map[clientId];
  if (!hints?.length) return null;
  const ctx = hints[0];
  return reviewSheetHrefFromContext({
    reviewKey: ctx.reviewKey,
    owners: ctx.owners,
    taxKinds: ctx.taxKinds,
    sources: ctx.focusOwner
      ? [{ owner: ctx.focusOwner, row: ctx.focusRow }]
      : undefined,
  });
}

/** 종소·법인 — 상호 자체에 검토표 링크 (「검토표」글자 뱃지 사용 안 함) */
function ReviewLinkedCompanyName({
  clientId,
  name,
  className,
  title,
  shouldSuppressClick,
}: {
  clientId: string;
  name: string;
  className?: string;
  title?: string;
  shouldSuppressClick?: () => boolean;
}) {
  const map = useContext(ReviewClientIdMapContext);
  const href = reviewSheetHrefFromHints(clientId, map);
  const display = name || '(이름 없음)';
  if (map === null) {
    return <span className={className}>{display}</span>;
  }
  const resolvedHref = href || `/clients/${clientId}`;
  const tip =
    title ||
    (href ? '검토표로 이동' : '수임처 상세');
  return (
    <a
      href={resolvedHref}
      draggable={false}
      className={`${className ?? ''} ${href ? 'hover:text-violet-700' : 'hover:text-blue-600'} hover:underline`}
      title={tip}
      onClick={e => {
        e.stopPropagation();
        if (shouldSuppressClick?.()) e.preventDefault();
      }}
    >
      {display}
    </a>
  );
}

function ClientDetailCompanyName({
  clientId,
  name,
  className,
  title,
  shouldSuppressClick,
}: {
  clientId: string;
  name: string;
  className?: string;
  title?: string;
  shouldSuppressClick?: () => boolean;
}) {
  return (
    <a
      href={`/clients/${clientId}`}
      draggable={false}
      className={`${className ?? ''} hover:text-blue-600 hover:underline`}
      title={title || '수임처 상세'}
      onClick={e => {
        e.stopPropagation();
        if (shouldSuppressClick?.()) e.preventDefault();
      }}
    >
      {name || '(이름 없음)'}
    </a>
  );
}

/** 세션 진입 시 제외 업체를 맨 아래로 — 세션 중 제외 토글 시에는 순서 유지 */
function splitStableDisplayOrder<T>(
  items: T[],
  idOf: (item: T) => string,
  isExcluded: (item: T) => boolean,
): string[] {
  const active: string[] = [];
  const excluded: string[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (isExcluded(item)) excluded.push(id);
    else active.push(id);
  }
  return [...active, ...excluded];
}

function orderByDisplayIds<T>(items: T[], orderIds: string[], idOf: (item: T) => string): T[] {
  const map = new Map(items.map(item => [idOf(item), item]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of orderIds) {
    const item = map.get(id);
    if (item) {
      out.push(item);
      seen.add(id);
    }
  }
  for (const item of items) {
    const id = idOf(item);
    if (!seen.has(id)) out.push(item);
  }
  return out;
}

function resolveExtraClients(
  extraClients: ManualClient[],
  allClients: ClientRecord[],
  orderedIds: Set<string>,
): ClientRecord[] {
  const out: ClientRecord[] = [];
  for (const m of extraClients) {
    if (orderedIds.has(m.id)) continue;
    const full = allClients.find(c => c.id === m.id);
    out.push(full ?? manualToClient(m));
  }
  return out;
}

function clientManagerKey(c: ClientRecord): string {
  return c.manager?.trim() || UNCategorized;
}

/** 신고유형 — 당월 / 전월 (레거시 차월 → 전월) */
function readFilingType(intakeData: Record<string, unknown> | undefined): '당월' | '전월' {
  const raw = String(intakeData?.filingType ?? '').trim();
  if (raw === '전월' || raw === '차월') return '전월';
  return '당월';
}

function readManualFilingType(client: ManualClient | undefined): '당월' | '전월' {
  return client?.filingType === '전월' ? '전월' : '당월';
}

function isContractProgressClient(client: ClientRecord): boolean {
  const status = String(client.status ?? '').trim();
  if (status !== 'intake') return true;
  const contractStatus = String(client.intakeData?.contractStatus ?? '').trim();
  return contractStatus.includes('계약');
}

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20';

// 신고때마다 저장하는 단위 데이터
type CheckRecord = {
  overrides: Record<string, boolean>; // 수동 체크 오버라이드
  excelBizNos: string[]; // 홈택스 접수목록 사업자번호(10자리)
  excelNamesByBiz?: Record<string, string>; // 사업자번호 → 상호
  /** 사업자번호 → 접수목록 행 건수 (동일 번호 복수 신고) */
  excelBizCounts?: Record<string, number>;
  fileName: string;
  diffReason: string;
  done: boolean;
  specialFilings: SpecialFiling[]; // 자동 감지된 수정·기한후 신고
  specialReasons: Record<string, string>; // 특이신고별 사유 (key = bizNo|type)
  excluded: Record<string, string>; // 신고목록 제외 (clientId → 제외사유)
  /** 반기 자동제외 등을 수기로 다시 살린 업체 */
  forceIncluded?: Record<string, boolean>;
  rowNotes: Record<string, string>; // 업체별 신고 특이사항 (clientId → 메모)
  extraClients: ManualClient[]; // 직접 추가한 업체 (다음 신고 때 자동 승계)
  siteDone?: Record<string, boolean>; // 종소세 사업장별 작업 완료
};

const EMPTY_RECORD: CheckRecord = {
  overrides: {},
  excelBizNos: [],
  excelNamesByBiz: {},
  excelBizCounts: {},
  fileName: '',
  diffReason: '',
  done: false,
  specialFilings: [],
  specialReasons: {},
  excluded: {},
  forceIncluded: {},
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
  receivedFromExcel = false,
}: {
  target: number;
  received: number;
  diff: number;
  unit?: '곳' | '건';
  /** true면 접수는 업로드 건수, 대상은 곳 */
  receivedFromExcel?: boolean;
}) {
  const receivedUnit = receivedFromExcel ? '건' : unit;
  const targetUnit = unit;
  return (
    <div
      className={`${portalCard} mt-3 flex flex-wrap items-center justify-between gap-3 border-emerald-100 bg-emerald-50/40 px-4 py-3`}
    >
      <p className="text-sm font-semibold text-slate-800">
        {receivedFromExcel ? '업로드 접수 ' : '총 체크 '}
        <span className="tabular-nums text-emerald-700">{received}</span>
        <span className="font-normal text-slate-500">{receivedUnit}</span>
        <span className="font-normal text-slate-500"> / 신고대상 </span>
        <span className="tabular-nums text-blue-700">{target}</span>
        <span className="font-normal text-slate-500">{targetUnit}</span>
        {diff > 0 && (
          <span className="ml-2 font-medium tabular-nums text-rose-600">
            (차이 {diff}건)
          </span>
        )}
      </p>
      {diff === 0 && target > 0 && (
        <span className="shrink-0 text-xs font-medium text-emerald-700">
          {receivedFromExcel ? '건수 일치' : '전체 접수 완료'}
        </span>
      )}
    </div>
  );
}

export default function FilingCheckPage() {
  return (
    <Suspense fallback={<PortalLoading label="신고접수검토 불러오는 중…" />}>
      <ReviewClientIdMapProvider>
        <FilingCheckPageInner />
      </ReviewClientIdMapProvider>
    </Suspense>
  );
}

function FilingReorderIndexCell({
  index,
}: {
  index: number;
}) {
  return <span className="text-xs tabular-nums text-slate-400">{index + 1}</span>;
}

const FILING_LONG_PRESS_MS = 280;
const FILING_MOVE_THRESHOLD = 6;

function FilingCheckPageInner() {
  const searchParams = useSearchParams();
  const cachedClients = usePortalClients();
  // 신고대상확인은 로그인한 사람과 무관하게 담당자별로 셋팅 → 전체 수임처를 받아 담당자로 가른다.
  const [allClients, setAllClients] = useState<ClientRecord[] | null>(null);
  const clients = allClients ?? cachedClients;
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  /** /api/auth/me 완료 전 — 빈 목록이 오류처럼 보이지 않게 */
  const [authReady, setAuthReady] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(true);
  /** 신고 세션(제외·접수) 서버 동기화 중 */
  const [sessionLoading, setSessionLoading] = useState(false);
  const [incomePanelClient, setIncomePanelClient] = useState<ClientRecord | null>(null);
  const [prevSession, setPrevSession] = useState<FilingCheckSessionData | null>(null);
  /** 직전 대비에 쓰는 완료 신고분의 periodKey (없으면 대비 비표시) */
  const [prevCompletedPeriodKey, setPrevCompletedPeriodKey] = useState<string | null>(null);
  /** 간이지급 — 활성 소득유형 칸 기준 전월대비 (그리드에서 계산) */
  const [spPeriodCompare, setSpPeriodCompare] = useState<PeriodCompareResult | null>(null);
  // 전체 조회 권한(인디·개발자)만 담당자 선택 — 일반 담당자는 본인 세션만
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
    if (!valid) return;
    const next = taxFromUrl as FilingTaxId;
    setTax(next);
    if (next === 'corporate') {
      const corp = defaultCorpFilingPeriod();
      setPeriod(p => ({ ...p, year: corp.year, corpPhase: corp.corpPhase }));
    }
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
  const incomeSectionRef = useRef<IncomeTypeFilingHandle>(null);
  const hometaxFileInputId = 'filing-check-hometax-upload';
  const pendingPersistRef = useRef<CheckRecord | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistInflightRef = useRef<Promise<void> | null>(null);
  const PERSIST_DEBOUNCE_MS = 400;
  const [incomeStats, setIncomeStats] = useState<IncomeFilingStats>({
    target: 0,
    received: 0,
    diff: 0,
    excludedRows: 0,
    byColumn: [],
    unreceivedNames: [],
    unreceivedByColumn: [],
  });
  const [incomeParsing, setIncomeParsing] = useState(false);
  const [incomeNotice, setIncomeNotice] = useState('');
  /** 접수목록 업로드 후에만 미접수 안내 표시 */
  const [incomeUploaded, setIncomeUploaded] = useState(false);
  const [employedFilingMonth, setEmployedFilingMonth] = useState(false);
  const [clientListSort] = useLocalStorage<ClientSortKey>(CLIENT_SORT_STORAGE_KEY, 'code');
  const [managerOrder] = useLocalStorage<string[]>(MANAGER_ORDER_STORAGE_KEY, [...MANAGER_DISPLAY_ORDER]);
  const [clientOrderVersion, setClientOrderVersion] = useState(0);
  const [incomeSavedTick, setIncomeSavedTick] = useState(false);
  const incomeSavedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statFilter, setStatFilter] = useState<IncomeStatFilter>('all');
  /** 신고대상 = 활성 지급명세 칸 · 전체 = 원천 제외(비활성) 포함 */
  const [listScope, setListScope] = useState<'targets' | 'all'>('all');
  const [displayOrderEpoch, setDisplayOrderEpoch] = useState(0);
  const displayOrderEpochAppliedRef = useRef(-1);
  const [targetDisplayOrder, setTargetDisplayOrder] = useState<string[]>([]);
  const [groupDisplayOrder, setGroupDisplayOrder] = useState<string[]>([]);
  const [comprehensiveDetail, setComprehensiveDetail] = useState<ComprehensiveFilingGroup | null>(null);
  /** 종소·법인 검토표 수수료 (clientId → 금액) */
  const [reviewFeeByClientId, setReviewFeeByClientId] = useState<Record<string, number | null>>({});
  const focusClientId = searchParams.get('client')?.trim() ?? '';
  const focusAppliedRef = useRef('');
  /** 다음 신고분 승계 시 유출 안내 문구를 특이사항에 한 번만 채움 */
  const closureCarryNotesKeyRef = useRef('');

  const cycle = getCycle(tax);
  const isIncomeTypeTax = tax === 'simplePayroll' || tax === 'yearEnd';
  /** 부가세는 기수별 순서 키 — ▲▼ 저장/조회 */
  const orderTaxKey = filingCheckOrderTaxKey(
    tax,
    tax === 'vat' ? period.vatPhase : tax === 'corporate' ? period.corpPhase : null,
  );
  const taxLabel = FILING_TAXES.find(t => t.id === tax)?.label ?? '';
  const keyId = `${managerPrefix(selManager)}${tax}:${periodKey(tax, period)}`;
  const loadedKeyRef = useRef<string>('');
  const sessionReadyRef = useRef(false);
  const colFilters = useColumnFilters(keyId);

  useEffect(() => {
    setStatFilter('all');
    setListScope('all');
    setIncomeNotice('');
    setIncomeUploaded(false);
    setUploadAddedNames([]);
  }, [tax, period.year, period.month, period.vatPhase, period.corpPhase, selManager]);

  // 종소·법인 — 검토표 수수료 로드
  useEffect(() => {
    if (tax !== 'comprehensive' && tax !== 'corporate') {
      setReviewFeeByClientId({});
      return;
    }
    let cancelled = false;
    void fetch(`/api/review/filing-fees?tax=${encodeURIComponent(tax)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        setReviewFeeByClientId((data?.byClientId as Record<string, number | null>) ?? {});
      })
      .catch(() => {
        if (!cancelled) setReviewFeeByClientId({});
      });
    return () => {
      cancelled = true;
    };
  }, [tax]);

  useEffect(() => {
    const onStorage = () => setClientOrderVersion(v => v + 1);
    window.addEventListener(`local-storage:${FILING_CHECK_CLIENT_ORDER_STORAGE_KEY}`, onStorage);
    window.addEventListener(`local-storage:${MANAGER_CLIENT_ORDER_STORAGE_KEY}`, onStorage);
    return () => {
      window.removeEventListener(`local-storage:${FILING_CHECK_CLIENT_ORDER_STORAGE_KEY}`, onStorage);
      window.removeEventListener(`local-storage:${MANAGER_CLIENT_ORDER_STORAGE_KEY}`, onStorage);
    };
  }, []);

  useEffect(() => {
    if (clientOrderVersion === 0) return;
    setDisplayOrderEpoch(e => e + 1);
  }, [clientOrderVersion]);

  const flushPersistSession = useCallback(async () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (!sessionReadyRef.current || loadedKeyRef.current !== keyId) {
      pendingPersistRef.current = null;
      return;
    }

    while (persistInflightRef.current) {
      await persistInflightRef.current;
    }

    const data = pendingPersistRef.current;
    if (!data) return;
    if (!sessionReadyRef.current || loadedKeyRef.current !== keyId) {
      pendingPersistRef.current = null;
      return;
    }
    pendingPersistRef.current = null;

    const pk = periodKey(tax, period);
    writeLocalFilingCheckSession(STORAGE_PREFIX, selManager, tax, pk, data);

    const run = (async () => {
      try {
        const res = await fetch('/api/filing-check/session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manager: selManager,
            taxType: tax,
            periodKey: pk,
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
    })();

    const tracked = run.finally(() => {
      if (persistInflightRef.current === tracked) persistInflightRef.current = null;
    });
    persistInflightRef.current = tracked;
    await tracked;

    if (pendingPersistRef.current) {
      await flushPersistSession();
    }
  }, [selManager, tax, period, keyId]);

  const persistSession = useCallback(
    (data: CheckRecord, opts?: { flush?: boolean }) => {
      if (!sessionReadyRef.current || loadedKeyRef.current !== keyId) {
        return Promise.resolve();
      }
      pendingPersistRef.current = data;
      writeLocalFilingCheckSession(
        STORAGE_PREFIX,
        selManager,
        tax,
        periodKey(tax, period),
        data,
      );

      if (opts?.flush) {
        return flushPersistSession();
      }
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        void flushPersistSession();
      }, PERSIST_DEBOUNCE_MS);
      return Promise.resolve();
    },
    [selManager, tax, period, keyId, flushPersistSession],
  );

  useEffect(() => {
    return () => {
      if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
      if (incomeSavedTickTimerRef.current) clearTimeout(incomeSavedTickTimerRef.current);
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      // 언마운트 시 대기 중인 스냅샷을 즉시 전송 (fire-and-forget)
      const pending = pendingPersistRef.current;
      if (pending && sessionReadyRef.current) {
        pendingPersistRef.current = null;
        const pk = periodKey(tax, period);
        writeLocalFilingCheckSession(STORAGE_PREFIX, selManager, tax, pk, pending);
        void fetch('/api/filing-check/session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manager: selManager,
            taxType: tax,
            periodKey: pk,
            data: pending,
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [selManager, tax, period]);

  // 기간·담당자 전환 시 미전송 debounce 취소 (이전 키로 쓰지 않도록)
  useEffect(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistRef.current = null;
  }, [keyId]);

  useEffect(() => {
    hydratePortal();
    let cancelled = false;
    void (async () => {
      setClientsLoading(true);
      let master = false;
      try {
        const meRes = await fetch('/api/auth/me');
        const me = meRes.ok ? await meRes.json() : null;
        if (cancelled) return;
        if (me?.user?.name) setCurrentUserName(String(me.user.name).trim());
        master = !!me?.isMaster;
        setIsMaster(master);
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setAuthReady(true);
      }

      // 포털 캐시가 있으면 즉시 목록 표시 (이후 서버로 갱신)
      const portalClients = getPortalClients();
      if (!cancelled && portalClients.length > 0) {
        setAllClients(portalClients);
        setClientsLoading(false);
      }

      const url = master
        ? '/api/clients?includeChurned=1&includeIntake=1'
        : '/api/clients?mine=1&scope=filing&includeChurned=1&includeIntake=1';
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const d = res.ok ? await res.json() : null;
        if (!cancelled && d?.clients) setAllClients(d.clients as ClientRecord[]);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 세목·기간이 바뀌면 저장된 기록을 불러오고,
  // 직전 완료(done) 신고분의 제외·특이사항을 승계한다.
  // 단, 접수 자체(엑셀/체크)는 신고분마다 새로 받으므로 가져오지 않는다.
  useEffect(() => {
    if (!selManager) {
      setSessionLoading(false);
      return;
    }
    let cancelled = false;
    const pk = periodKey(tax, period);
    sessionReadyRef.current = false;
    loadedKeyRef.current = '';
    closureCarryNotesKeyRef.current = '';
    setSessionLoading(true);
    setCarriedFrom(null);
    setParseError('');
    setCopied(false);
    setIncomeNotice('');
    setIncomeUploaded(false);
    setUploadAddedNames([]);
    if (fileRef.current) fileRef.current.value = '';

    // 로컬 캐시를 먼저 그려 빈 화면(오류처럼 보임)을 피함 — 서버 응답 후 확정
    const localRec = readLocalFilingCheckSession(STORAGE_PREFIX, selManager, tax, pk);
    if (localRec && hasFilingCarryData(localRec)) {
      setRecord({ ...EMPTY_RECORD, ...localRec });
    } else {
      setRecord({ ...EMPTY_RECORD });
    }

    const loadFromServer = async () => {
      try {
        const res = await fetch(
          `/api/filing-check/session?manager=${encodeURIComponent(selManager)}&taxType=${tax}&periodKey=${pk}&withCarry=1`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          return {
            ok: false as const,
            data: null as CheckRecord | null,
            carriedFromPeriodKey: null as string | null,
          };
        }
        const json = (await res.json()) as {
          data?: CheckRecord;
          carriedFromPeriodKey?: string | null;
        };
        return {
          ok: true as const,
          data: json.data ?? null,
          carriedFromPeriodKey: json.carriedFromPeriodKey ?? null,
        };
      } catch {
        return {
          ok: false as const,
          data: null as CheckRecord | null,
          carriedFromPeriodKey: null as string | null,
        };
      }
    };

    void (async () => {
      const { ok, data: serverRec, carriedFromPeriodKey } = await loadFromServer();
      if (cancelled) return;

      // 서버 성공 시 서버만 사용(로컬 병합으로 삭제값이 되살아나지 않게).
      // 서버 실패 시에만 로컬 폴백.
      let next: CheckRecord;
      if (ok) {
        next = { ...EMPTY_RECORD, ...(serverRec ?? {}) };
      } else if (localRec && hasFilingCarryData(localRec)) {
        next = { ...EMPTY_RECORD, ...localRec };
      } else {
        next = { ...EMPTY_RECORD };
      }

      if (carriedFromPeriodKey) {
        setCarriedFrom(periodLabel(tax, parsePeriodKey(tax, carriedFromPeriodKey)));
      } else {
        setCarriedFrom(null);
      }

      setRecord(next);
      writeLocalFilingCheckSession(STORAGE_PREFIX, selManager, tax, pk, next);
      loadedKeyRef.current = keyId;
      sessionReadyRef.current = true;
      setSessionLoading(false);
      setDisplayOrderEpoch(e => e + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId, selManager, tax, period]);

  // 기록 변경 시 저장(디바운스). 완료(done) 상태에서는 완료 취소만 허용. done 변경은 즉시 flush.
  const patchRecord = (patch: Partial<CheckRecord>) => {
    setRecord(prev => {
      const unlocking = prev.done && patch.done === false;
      if (prev.done && !unlocking) return prev;
      const next = { ...prev, ...patch };
      const flush = patch.done !== undefined || patch.fileName !== undefined;
      void persistSession(next, flush ? { flush: true } : undefined);
      return next;
    });
  };

  // 직전 신고 대비 세션 (완료분 우선 · 없으면 달력 직전 기간)
  useEffect(() => {
    if (!selManager) {
      setPrevSession(null);
      setPrevCompletedPeriodKey(null);
      return;
    }
    const pk = periodKey(tax, period);
    let cancelled = false;
    void fetch(
      `/api/filing-check/session?manager=${encodeURIComponent(selManager)}&taxType=${tax}&periodKey=${encodeURIComponent(pk)}&previousCompleted=1`,
      { cache: 'no-store' },
    )
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const data = (d?.data as FilingCheckSessionData | null) ?? null;
        const prevPk = typeof d?.periodKey === 'string' ? d.periodKey : null;
        if (!prevPk) {
          setPrevSession(null);
          setPrevCompletedPeriodKey(null);
          return;
        }
        setPrevSession(data);
        setPrevCompletedPeriodKey(prevPk);
      })
      .catch(() => {
        if (!cancelled) {
          setPrevSession(null);
          setPrevCompletedPeriodKey(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tax, period, selManager]);

  const scopeByManager = useCallback(
    (list: ClientRecord[]) => {
      if (selManager === ALL_MANAGERS) return list;
      const names = new Set(getManagerMatchNames(selManager));
      names.add(selManager);
      return list.filter(c => names.has(c.manager?.trim() || UNCategorized));
    },
    [selManager],
  );

  const matchesSelManager = useCallback(
    (manager: string | undefined | null) => {
      if (selManager === ALL_MANAGERS) return true;
      const names = new Set(getManagerMatchNames(selManager));
      names.add(selManager);
      return names.has(manager?.trim() || UNCategorized);
    },
    [selManager],
  );

  const locked = record.done;
  const pageBootLoading = !authReady || !selManager;
  const clientsBootLoading = clientsLoading && clients.length === 0;
  const blockingLoading = pageBootLoading || clientsBootLoading;

  /** 원천·간이지급: period.month는 신고월, 귀속월은 전월 */
  const attribution = useMemo(
    () => attributionMonthFromReportMonth(period.year, period.month),
    [period.year, period.month],
  );

  useEffect(() => {
    setIncomeNotice('');
    setEmployedFilingMonth(false);
  }, [tax, period.year, period.month, selManager]);

  useEffect(() => {
    if (tax !== 'simplePayroll') setSpPeriodCompare(null);
  }, [tax]);

  const handleTaxChange = (next: FilingTaxId) => {
    if (next === tax) return;
    setTax(next);
    if (next === 'withholding' || next === 'simplePayroll' || next === 'yearEnd') {
      setPeriod(p => ({ ...p, ...defaultPeriod() }));
      return;
    }
    if (next === 'corporate') {
      const corp = defaultCorpFilingPeriod();
      setPeriod(p => ({ ...p, year: corp.year, corpPhase: corp.corpPhase }));
    }
  };

  // 현재 세목 전체 신고대상(담당자 무관) — 담당자별 카운트·필터 기준
  // 신고 기간 시작일 이전에 유출·폐업된 업체는 제외, 기간 중 발생분은 포함(안내 배지 표시)
  const taxTargetsAll = useMemo(() => {
    const raw =
      tax === 'withholding'
        ? withholdingTargetsForPeriod(clients, attribution.month)
        : tax === 'simplePayroll'
          ? simplePayrollTargetsForPeriod(clients, attribution.month)
          : tax === 'vat'
            ? filingTargets(clients, 'vat', { vatPhase: period.vatPhase })
            : filingTargets(clients, tax);
    return raw.filter(c => isContractProgressClient(c) && !isClosedBeforeFilingPeriod(c, tax, period));
  }, [clients, tax, period, attribution.month]);

  const excelSet = useMemo(() => new Set(record.excelBizNos), [record.excelBizNos]);
  const extraClientIds = useMemo(
    () => new Set(record.extraClients.map(m => m.id)),
    [record.extraClients],
  );

  const periodCompare = useMemo((): PeriodCompareResult | null => {
    if (tax === 'simplePayroll') return spPeriodCompare;
    // 직전 완료분 periodKey(없으면 API가 달력 직전으로 채움)
    if (!prevCompletedPeriodKey) return null;
    const prevPk = prevCompletedPeriodKey;
    const prevP = parsePeriodKey(tax, prevPk);
    const prevRec = prevSession ?? EMPTY_RECORD;
    const withExtras = (base: ClientRecord[]) => {
      const seen = new Set(base.map(c => c.id));
      return [
        ...base,
        ...resolveExtraClients(prevRec.extraClients ?? [], clients, seen),
      ];
    };

    if (tax === 'withholding') {
      const prevAttr = attributionMonthFromReportMonth(prevP.year, prevP.month);
      return compareWithholdingMonths(
        scopeByManager(taxTargetsAll),
        prevRec,
        record,
        prevAttr.month,
        attribution.month,
      );
    }
    if (tax === 'comprehensive') {
      const prevGroups = groupComprehensiveFilingTargets(
        withExtras(scopeByManager(filingTargets(clients, tax).filter(isContractProgressClient))),
      );
      const currGroups = groupComprehensiveFilingTargets(scopeByManager(taxTargetsAll));
      return compareComprehensiveGroups(prevGroups, currGroups, prevRec, record);
    }

    const prevAll =
      tax === 'vat'
        ? filingTargets(clients, tax, { vatPhase: prevP.vatPhase }).filter(isContractProgressClient)
        : filingTargets(clients, tax).filter(isContractProgressClient);
    const prevExcelSet = new Set(
      (prevRec.excelBizNos ?? []).map(b => normalizeBizNo(String(b))),
    );
    const vatAutoUnreceivedCurr =
      tax === 'vat' &&
      period.vatPhase === '1기 확정' &&
      (excelSet.size > 0 || Object.values(record.overrides).some(Boolean) || record.done);
    const vatAutoUnreceivedPrev =
      tax === 'vat' &&
      prevP.vatPhase === '1기 확정' &&
      (prevExcelSet.size > 0 ||
        Object.values(prevRec.overrides ?? {}).some(Boolean) ||
        prevRec.done);

    /** 합계표·예정고지에 잘못 붙은 「미접수 자동제외」는 직전대비에서 무시 */
    const stripSkipReceiptAutoExclude = (
      session: FilingCheckSessionData,
      phase: VatPhase,
      pool: ClientRecord[],
    ): FilingCheckSessionData => {
      const AUTO = '미접수 자동제외';
      const excluded = { ...(session.excluded ?? {}) };
      let changed = false;
      const byId = new Map(pool.map(c => [c.id, c]));
      for (const id of Object.keys(excluded)) {
        if (excluded[id] !== AUTO) continue;
        const c = byId.get(id);
        if (!c) continue;
        const skip =
          isVatSummaryOnlyClient(c) ||
          (isVatProvisionalPhase(phase) &&
            isVatNoticeObligation(readVatObligation(c, phase)));
        if (skip) {
          delete excluded[id];
          changed = true;
        }
      }
      return changed ? { ...session, excluded } : session;
    };

    const prevTargetsVat = withExtras(scopeByManager(prevAll));
    const currTargetsVat = scopeByManager(taxTargetsAll);
    const prevRecForCompare =
      tax === 'vat'
        ? stripSkipReceiptAutoExclude(prevRec, prevP.vatPhase, prevTargetsVat)
        : prevRec;
    const currRecForCompare =
      tax === 'vat'
        ? stripSkipReceiptAutoExclude(record, period.vatPhase, currTargetsVat)
        : record;

    return compareSessionTargets(
      prevTargetsVat,
      currTargetsVat,
      prevRecForCompare,
      currRecForCompare,
      vatAutoUnreceivedCurr || vatAutoUnreceivedPrev
        ? {
            isAutoExcluded: (c, which) => {
              // 합계표제출·예정고지: 신고대상 목록 유지, 접수만 스킵 → 직전대비·자동제외에 미반영
              if (isVatSummaryOnlyClient(c)) return false;
              const phase = which === 'curr' ? period.vatPhase : prevP.vatPhase;
              if (
                isVatProvisionalPhase(phase) &&
                isVatNoticeObligation(readVatObligation(c, phase))
              ) {
                return false;
              }
              if (which === 'curr' && vatAutoUnreceivedCurr) {
                if (Boolean(record.forceIncluded?.[c.id])) return false;
                const received = excelSet.has(normalizeBizNo(c.businessNo));
                return !received;
              }
              if (which === 'prev' && vatAutoUnreceivedPrev) {
                if (Boolean(prevRec.forceIncluded?.[c.id])) return false;
                const received = prevExcelSet.has(normalizeBizNo(c.businessNo));
                return !received;
              }
              return false;
            },
          }
        : undefined,
    );
  }, [
    tax,
    period,
    clients,
    prevSession,
    prevCompletedPeriodKey,
    record,
    scopeByManager,
    taxTargetsAll,
    attribution.month,
    excelSet,
    spPeriodCompare,
  ]);

  const compareLabels = useMemo(() => {
    if (usesMonthOverMonthCompare(tax)) {
      const prevLabel = prevCompletedPeriodKey
        ? periodLabel(tax, parsePeriodKey(tax, prevCompletedPeriodKey))
        : '전월';
      return {
        title: '전월 대비 신고대상',
        prev: prevLabel,
        curr: '이번 달',
      };
    }
    const prevLabel = prevCompletedPeriodKey
      ? periodLabel(tax, parsePeriodKey(tax, prevCompletedPeriodKey))
      : '직전';
    return {
      title: '직전 신고 대비',
      prev: prevLabel,
      curr: periodLabel(tax, period),
    };
  }, [tax, period, prevCompletedPeriodKey]);

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
    if (tax === 'vat' && isVatProvisionalPhase(period.vatPhase)) {
      const { filing } = vatObligationManagerCounts(taxTargetsAll, period.vatPhase);
      return filing;
    }
    for (const c of taxTargetsAll) {
      const k = c.manager?.trim() || UNCategorized;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [tax, taxTargetsAll, period.vatPhase]);

  const vatManagerNoticeCounts = useMemo(() => {
    if (tax !== 'vat' || !isVatProvisionalPhase(period.vatPhase)) return new Map<string, number>();
    return vatObligationManagerCounts(taxTargetsAll, period.vatPhase).notice;
  }, [tax, taxTargetsAll, period.vatPhase]);

  const vatAllFilingCount = useMemo(() => {
    if (tax !== 'vat' || !isVatProvisionalPhase(period.vatPhase)) return taxTargetsAll.length;
    return [...vatObligationManagerCounts(taxTargetsAll, period.vatPhase).filing.values()].reduce(
      (a, b) => a + b,
      0,
    );
  }, [tax, taxTargetsAll, period.vatPhase]);

  const vatAllNoticeCount = useMemo(() => {
    if (tax !== 'vat' || !isVatProvisionalPhase(period.vatPhase)) return 0;
    return [...vatManagerNoticeCounts.values()].reduce((a, b) => a + b, 0);
  }, [tax, vatManagerNoticeCounts, period.vatPhase]);

  const managerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) set.add(c.manager?.trim() || UNCategorized);
    return [...set].sort((a, b) => compareManagersByOrder(a, b, managerOrder, UNCategorized));
  }, [clients, managerOrder]);

  /** 간이지급·연말정산 — 원천세 탭에서 꾹 눌러 정한 순서(저장 목록) 우선 */
  const withholdingOrderIds = useMemo(() => {
    if (!isIncomeTypeTax) return [];
    // 연말정산은 연간 원천 대상, 간이지급은 해당 귀속월 원천 대상과 맞춤
    const whPool = (
      tax === 'yearEnd'
        ? filingTargets(clients, 'withholding')
        : withholdingTargetsForPeriod(clients, attribution.month)
    ).filter(isContractProgressClient);

    if (selManager === ALL_MANAGERS) {
      return applyManagerScopedFilingCheckOrder(
        whPool,
        clientListSort,
        ALL_MANAGERS,
        ALL_MANAGERS,
        managerOrder,
        'withholding',
      ).map(c => c.id);
    }

    const scoped = whPool.filter(c => matchesSelManager(c.manager));
    const custom = readFilingCheckClientOrder(selManager, 'withholding');
    if (custom?.length) {
      // 저장된 순서 id를 앞에 두고, 원천 대상에만 있는 나머지는 뒤에
      const inScope = new Set(scoped.map(c => c.id));
      const head = custom.filter(id => inScope.has(id));
      const headSet = new Set(head);
      const tail = scoped.map(c => c.id).filter(id => !headSet.has(id));
      return [...head, ...tail];
    }

    return applyManagerScopedFilingCheckOrder(
      scoped,
      clientListSort,
      selManager,
      ALL_MANAGERS,
      managerOrder,
      'withholding',
    ).map(c => c.id);
  }, [
    isIncomeTypeTax,
    tax,
    clients,
    attribution.month,
    selManager,
    matchesSelManager,
    clientListSort,
    managerOrder,
    clientOrderVersion,
  ]);

  const targets = useMemo(() => {
    const scoped =
      selManager === ALL_MANAGERS
        ? taxTargetsAll
        : taxTargetsAll.filter(c => matchesSelManager(c.manager));
    const ordered = applyManagerScopedFilingCheckOrder(
      scoped,
      clientListSort,
      selManager,
      ALL_MANAGERS,
      managerOrder,
      orderTaxKey,
    );
    const seen = new Set(ordered.map(c => c.id));

    const manual = resolveExtraClients(record.extraClients, clients, seen).filter(c => {
      if (selManager !== ALL_MANAGERS && !matchesSelManager(c.manager)) return false;
      return true;
    });

    return [...ordered, ...manual];
  }, [
    taxTargetsAll,
    selManager,
    matchesSelManager,
    record.extraClients,
    clientListSort,
    managerOrder,
    orderTaxKey,
    clientOrderVersion,
    clients,
  ]);

  // 부가세 1기 확정: 접수완료가 아닌 업체는 제외 체크 (완료 후에도 간이 추가 등 미접수 반영)
  useEffect(() => {
    if (!sessionReadyRef.current || loadedKeyRef.current !== keyId) return;
    if (tax !== 'vat' || period.vatPhase !== '1기 확정') return;
    const hasReceipt =
      excelSet.size > 0 ||
      Object.values(record.overrides).some(Boolean) ||
      record.done;
    if (!hasReceipt) return;

    const AUTO = '미접수 자동제외';
    let changed = false;
    const nextExcluded = { ...record.excluded };
    for (const c of targets) {
      if (Boolean(record.forceIncluded?.[c.id])) continue;
      // 합계표제출·예정고지 = 목록에는 두되 접수검증만 제외 → 미접수 자동제외 대상 아님
      const skipReceiptOnly =
        isVatSummaryOnlyClient(c) ||
        (isVatProvisionalPhase(period.vatPhase) &&
          isVatNoticeObligation(readVatObligation(c, period.vatPhase)));
      if (skipReceiptOnly) {
        if (nextExcluded[c.id] === AUTO) {
          delete nextExcluded[c.id];
          changed = true;
        }
        continue;
      }
      const received = excelSet.has(normalizeBizNo(c.businessNo));
      if (received) {
        if (nextExcluded[c.id] === AUTO) {
          delete nextExcluded[c.id];
          changed = true;
        }
        continue;
      }
      // 미접수 → 제외 (수동 사유가 있으면 유지, 없으면 자동제외)
      if (!Object.prototype.hasOwnProperty.call(nextExcluded, c.id)) {
        nextExcluded[c.id] = AUTO;
        changed = true;
      }
    }
    if (!changed) return;
    // 「전체」화면의 합산 제외는 담당자 세션에서만 유지 — 로컬 UI만 맞추고 저장하지 않음
    if (selManager === ALL_MANAGERS) {
      setRecord(prev => ({ ...prev, excluded: nextExcluded }));
      return;
    }
    // 완료(done) 잠금이어도 미접수 자동제외는 반영·저장
    setRecord(prev => {
      const next = { ...prev, excluded: nextExcluded };
      void persistSession(next, { flush: true });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tax,
    period.vatPhase,
    keyId,
    targets,
    record.excelBizNos,
    record.overrides,
    record.forceIncluded,
    record.done,
    excelSet,
    selManager,
  ]);
  useEffect(() => {
    if (!carriedFrom || !sessionReadyRef.current) return;
    const pk = periodKey(tax, period);
    const applyKey = `${selManager}|${tax}|${pk}|${carriedFrom}`;
    if (closureCarryNotesKeyRef.current === applyKey) return;

    const updates: Record<string, string> = {};
    for (const c of targets) {
      const notice = filingClosureNotice(c);
      if (!notice) continue;
      if ((record.rowNotes[c.id] ?? '').trim()) continue;
      if (Object.prototype.hasOwnProperty.call(record.excluded, c.id)) continue;
      updates[c.id] = notice;
    }
    closureCarryNotesKeyRef.current = applyKey;
    if (Object.keys(updates).length === 0) return;
    patchRecord({ rowNotes: { ...record.rowNotes, ...updates } });
  }, [carriedFrom, targets, selManager, tax, period, record.rowNotes, record.excluded]);

  const isReceived = (_id: string, bizNo: string) =>
    excelSet.has(normalizeBizNo(bizNo));

  /** 종소세 접수 — 엑셀 대조만 (수기 체크 불가) */
  const isGroupFilingReceived = (g: ComprehensiveFilingGroup) => {
    const withBiz = g.clients.filter(c => normalizeBizNo(c.businessNo) !== '');
    if (withBiz.length === 0) return false;
    return withBiz.every(c => excelSet.has(normalizeBizNo(c.businessNo)));
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

  const isForceIncluded = (id: string) => Boolean(record.forceIncluded?.[id]);

  // 연말정산·간이지급 제외는 원천세 세션에서 끌어옴 (IncomeTypeFilingSection)
  const excludeReasonOf = (c: ClientRecord): string | null => {
    if (isManualExcluded(c.id)) return record.excluded[c.id] ?? '';
    // 수기로 다시 살린 업체는 반기 자동제외 무시
    if (isForceIncluded(c.id)) return null;
    if (
      tax === 'withholding' &&
      isSemiAnnualOffMonthExcluded(c.intakeData ?? {}, attribution.month)
    ) {
      return SEMI_ANNUAL_OFF_MONTH_EXCLUDE_REASON;
    }
    return null;
  };

  // 제외 처리된 업체는 신고대상에서 빠짐 (수동 제외)
  const activeTargets = useMemo(
    () => targets.filter(c => excludeReasonOf(c) === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, record.excluded, record.forceIncluded, tax, attribution.month],
  );
  const excludedTargets = useMemo(
    () => targets.filter(c => excludeReasonOf(c) !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, record.excluded, record.forceIncluded, tax, attribution.month],
  );

  const isGroupReceived = (g: ComprehensiveFilingGroup) => isGroupFilingReceived(g);

  const activeComprehensiveGroups = useMemo(
    () => comprehensiveGroups.filter(g => excludeReasonOf(g.clients[0]) === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comprehensiveGroups, record.excluded, tax],
  );
  const excludedComprehensiveGroups = useMemo(
    () => comprehensiveGroups.filter(g => excludeReasonOf(g.clients[0]) !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comprehensiveGroups, record.excluded, tax],
  );

  const isExtraAdded = (id: string) => extraClientIds.has(id);

  const vatProvisional = tax === 'vat' && isVatProvisionalPhase(period.vatPhase);

  const vatFilingActiveTargets = useMemo(() => {
    if (!vatProvisional) return activeTargets;
    return activeTargets.filter(c =>
      isVatFilingObligation(readVatObligation(c, period.vatPhase)),
    );
  }, [activeTargets, vatProvisional, period.vatPhase]);

  const vatNoticeActiveTargets = useMemo(() => {
    if (!vatProvisional) return [];
    return activeTargets.filter(c =>
      isVatNoticeObligation(readVatObligation(c, period.vatPhase)),
    );
  }, [activeTargets, vatProvisional, period.vatPhase]);

  /** 접수 집계 대상 — 예정고지·합계표제출 제외 */
  const receiptActiveTargets = useMemo(() => {
    const base = tax === 'vat' && vatProvisional ? vatFilingActiveTargets : activeTargets;
    if (tax !== 'vat') return base;
    return base.filter(c => !isVatSummaryOnlyClient(c));
  }, [tax, vatProvisional, vatFilingActiveTargets, activeTargets]);

  const receivedMatchedCount =
    tax === 'comprehensive'
      ? activeComprehensiveGroups.filter(g => isGroupReceived(g)).length
      : receiptActiveTargets.filter(c => isReceived(c.id, c.businessNo)).length;
  const targetCount =
    tax === 'comprehensive'
      ? activeComprehensiveGroups.length
      : receiptActiveTargets.length;
  const vatNoticeTargetCount = vatProvisional ? vatNoticeActiveTargets.length : 0;
  /** 합계표제출 — 접수목록 검증 제외 대상 (부가세) */
  const vatSummaryOnlyTargets = useMemo(() => {
    if (tax !== 'vat') return [];
    return activeTargets.filter(c => isVatSummaryOnlyClient(c));
  }, [tax, activeTargets]);
  const tableExtraCols = (tax === 'withholding' ? 1 : 0) + (vatProvisional ? 1 : 0);
  const showsReviewFeeColumn = tax === 'vat' || tax === 'comprehensive' || tax === 'corporate';
  const tableColSpan = (showsReviewFeeColumn ? 7 : 6) + tableExtraCols;
  const comprehensiveColSpan = showsReviewFeeColumn ? 8 : 7;

  /** 원천세 — 같은 사업자번호 접수 행 2건↑ 초과분 (필터·안내용) */
  const surplusFilingDiff = useMemo(() => {
    if (tax !== 'withholding') return 0;
    return surplusFilingCountForTargets(
      record.excelBizCounts,
      receiptActiveTargets.map(c => c.businessNo),
    );
  }, [tax, record.excelBizCounts, receiptActiveTargets]);

  const excelFilingTotal = useMemo(() => {
    const counts = record.excelBizCounts;
    if (counts && Object.keys(counts).length > 0) {
      return Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
    }
    return excelSet.size;
  }, [record.excelBizCounts, excelSet]);

  /** 통계 카드용 접수완료 — 업로드 파일이 있으면 파일 행 수, 없으면 체크(매칭) 수 */
  const hasExcelReceipt = excelSet.size > 0;
  const receivedCount = hasExcelReceipt ? excelFilingTotal : receivedMatchedCount;

  const multiFilings = useMemo(() => {
    if (tax !== 'withholding') return [] as { bizNo: string; name: string; count: number }[];
    const counts = record.excelBizCounts ?? {};
    const nameByBiz = new Map<string, string>();
    for (const [biz, name] of Object.entries(record.excelNamesByBiz ?? {})) {
      if (biz && name?.trim()) nameByBiz.set(normalizeBizNo(biz), name.trim());
    }
    for (const c of receiptActiveTargets) {
      const biz = normalizeBizNo(c.businessNo);
      if (biz && !nameByBiz.has(biz)) nameByBiz.set(biz, c.companyName || '(이름없음)');
    }
    const targetBiz = new Set(
      receiptActiveTargets.map(c => normalizeBizNo(c.businessNo)).filter(Boolean),
    );
    const items: { bizNo: string; name: string; count: number }[] = [];
    for (const [rawBiz, count] of Object.entries(counts)) {
      const biz = normalizeBizNo(rawBiz);
      const n = Number(count) || 0;
      if (!biz || n <= 1 || !targetBiz.has(biz)) continue;
      items.push({
        bizNo: biz,
        name: nameByBiz.get(biz) || biz,
        count: n,
      });
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [tax, record.excelBizCounts, record.excelNamesByBiz, receiptActiveTargets]);

  const multiFilingMissingReason = useMemo(
    () =>
      multiFilings.some(m => !(record.specialReasons[multiFilingReasonKey(m.bizNo)] ?? '').trim()),
    [multiFilings, record.specialReasons],
  );

  const diff =
    tax === 'comprehensive'
      ? activeComprehensiveGroups.length -
        activeComprehensiveGroups.filter(g => isGroupReceived(g)).length
      : hasExcelReceipt
        ? Math.abs(targetCount - receivedCount)
        : targetCount - receivedMatchedCount;
  const notReceived =
    tax === 'comprehensive'
      ? activeComprehensiveGroups.filter(g => !isGroupReceived(g))
      : receiptActiveTargets.filter(c => !isReceived(c.id, c.businessNo));
  const excludedTargetsForSummary =
    tax === 'comprehensive'
      ? excludedComprehensiveGroups.map(g => g.clients[0])
      : excludedTargets;

  const toggleStatFilter = useCallback((filter: IncomeStatFilter) => {
    setStatFilter(prev => (prev === filter ? 'all' : filter));
  }, []);

  // 세션 진입 시에만 제외 업체를 하단으로 정렬 — 제외 체크 직후에는 순서 고정
  useEffect(() => {
    if (!sessionReadyRef.current) return;

    const isExcludedClient = (c: ClientRecord) => excludeReasonOf(c) !== null;
    const isExcludedGroup = (g: ComprehensiveFilingGroup) => excludeReasonOf(g.clients[0]) !== null;

    if (displayOrderEpochAppliedRef.current !== displayOrderEpoch) {
      displayOrderEpochAppliedRef.current = displayOrderEpoch;
      setTargetDisplayOrder(splitStableDisplayOrder(targets, c => c.id, isExcludedClient));
      setGroupDisplayOrder(
        splitStableDisplayOrder(comprehensiveGroups, g => g.groupKey, isExcludedGroup),
      );
      return;
    }

    setTargetDisplayOrder(prev => {
      const known = new Set(prev);
      const extra = targets.map(c => c.id).filter(id => !known.has(id));
      if (!extra.length) return prev;
      if (prev.length === 0 && targets.length > 0) {
        return splitStableDisplayOrder(targets, c => c.id, isExcludedClient);
      }
      return [...prev, ...extra];
    });

    setGroupDisplayOrder(prev => {
      const known = new Set(prev);
      const extra = comprehensiveGroups.map(g => g.groupKey).filter(k => !known.has(k));
      if (!extra.length) return prev;
      if (prev.length === 0 && comprehensiveGroups.length > 0) {
        return splitStableDisplayOrder(comprehensiveGroups, g => g.groupKey, isExcludedGroup);
      }
      return [...prev, ...extra];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOrderEpoch, targets, comprehensiveGroups]);

  const targetsInDisplayOrder = useMemo(
    () => orderByDisplayIds(targets, targetDisplayOrder, c => c.id),
    [targets, targetDisplayOrder],
  );

  const comprehensiveGroupsInDisplayOrder = useMemo(
    () => orderByDisplayIds(comprehensiveGroups, groupDisplayOrder, g => g.groupKey),
    [comprehensiveGroups, groupDisplayOrder],
  );

  const displayedComprehensiveGroups = useMemo(() => {
    const base =
      listScope === 'all'
        ? comprehensiveGroupsInDisplayOrder
        : comprehensiveGroupsInDisplayOrder.filter(g => excludeReasonOf(g.clients[0]) === null);
    if (statFilter === 'all') return base;
    return base.filter(g => {
      const excluded = excludeReasonOf(g.clients[0]) !== null;
      if (statFilter === 'target') return !excluded;
      const received = isGroupReceived(g);
      if (statFilter === 'received') return !excluded && received;
      if (statFilter === 'diff') return !excluded && !received;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comprehensiveGroupsInDisplayOrder, listScope, statFilter, record.excluded, tax]);

  const displayedTargets = useMemo(() => {
    const base =
      listScope === 'all'
        ? targetsInDisplayOrder
        : targetsInDisplayOrder.filter(c => excludeReasonOf(c) === null);
    if (statFilter === 'all') return base;
    return base.filter(c => {
      const excluded = excludeReasonOf(c) !== null;
      if (statFilter === 'target') return !excluded;
      const skipReceipt =
        tax === 'vat' &&
        (isVatSummaryOnlyClient(c) ||
          (vatProvisional && isVatNoticeObligation(readVatObligation(c, period.vatPhase))));
      if (skipReceipt && (statFilter === 'received' || statFilter === 'diff')) return false;
      const received = isReceived(c.id, c.businessNo);
      if (statFilter === 'received') return !excluded && received;
      if (statFilter === 'diff') {
        if (excluded) return false;
        if (!received) return true;
        if (tax === 'withholding') {
          return filingCountForBiz(record.excelBizCounts, excelSet, c.businessNo) > 1;
        }
        return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    targetsInDisplayOrder,
    listScope,
    statFilter,
    record.excluded,
    record.overrides,
    record.excelBizCounts,
    excelSet,
    tax,
    vatProvisional,
    period.vatPhase,
  ]);

  const statFilterBanner =
    statFilter !== 'all' ? (
      <p className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        {statFilter === 'target' && '신고대상 업체만 표시 중'}
        {statFilter === 'received' && '접수완료 업체만 표시 중'}
        {statFilter === 'diff' &&
          (tax === 'withholding'
            ? '미완료·복수접수(차이) 업체만 표시 중'
            : '미완료(차이) 업체만 표시 중')}
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
    const nextExcluded = { ...record.excluded };
    const nextForce = { ...(record.forceIncluded ?? {}) };
    if (on) {
      // 제외 ON — 강제포함 해제 + 수동 제외
      delete nextForce[id];
      nextExcluded[id] = nextExcluded[id] ?? '';
    } else {
      // 제외 OFF — 수동 제외 해제 + 반기 자동제외도 수기로 살림
      delete nextExcluded[id];
      nextForce[id] = true;
    }
    patchRecord({ excluded: nextExcluded, forceIncluded: nextForce });
  };

  const setExcludeReason = (id: string, reason: string) => {
    patchRecord({ excluded: { ...record.excluded, [id]: reason } });
  };

  const setRowNote = (id: string, note: string) => {
    patchRecord({ rowNotes: { ...record.rowNotes, [id]: note } });
  };

  const patchWithholdingRowNote = useCallback(
    async (id: string, note: string) => {
      if (!selManager) return;
      const whPk = simplePayrollMonthlyPeriodKey(attribution.year, attribution.month);
      try {
        const res = await fetch(
          `/api/filing-check/session?manager=${encodeURIComponent(selManager)}&taxType=withholding&periodKey=${encodeURIComponent(whPk)}`,
          { cache: 'no-store' },
        );
        const json = res.ok ? ((await res.json()) as { data?: CheckRecord | null }) : null;
        const base: CheckRecord = {
          ...EMPTY_RECORD,
          ...(json?.data ?? readLocalFilingCheckSession(STORAGE_PREFIX, selManager, 'withholding', whPk) ?? {}),
        };
        const next: CheckRecord = {
          ...base,
          rowNotes: { ...base.rowNotes, [id]: note },
        };
        writeLocalFilingCheckSession(STORAGE_PREFIX, selManager, 'withholding', whPk, next);
        await fetch('/api/filing-check/session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manager: selManager,
            taxType: 'withholding',
            periodKey: whPk,
            data: next,
          }),
        });
      } catch {
        /* ignore */
      }
    },
    [selManager, period.year, period.month],
  );

  const patchWithholdingExcludeReason = useCallback(
    async (id: string, reason: string) => {
      if (!selManager) return;
      const whPk = simplePayrollMonthlyPeriodKey(attribution.year, attribution.month);
      try {
        const res = await fetch(
          `/api/filing-check/session?manager=${encodeURIComponent(selManager)}&taxType=withholding&periodKey=${encodeURIComponent(whPk)}`,
          { cache: 'no-store' },
        );
        const json = res.ok ? ((await res.json()) as { data?: CheckRecord | null }) : null;
        const base: CheckRecord = {
          ...EMPTY_RECORD,
          ...(json?.data ?? readLocalFilingCheckSession(STORAGE_PREFIX, selManager, 'withholding', whPk) ?? {}),
        };
        const next: CheckRecord = {
          ...base,
          excluded: { ...base.excluded, [id]: reason },
        };
        writeLocalFilingCheckSession(STORAGE_PREFIX, selManager, 'withholding', whPk, next);
        await fetch('/api/filing-check/session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manager: selManager,
            taxType: 'withholding',
            periodKey: whPk,
            data: next,
          }),
        });
      } catch {
        /* ignore */
      }
    },
    [selManager, period.year, period.month],
  );

  const managerScopedClients = useMemo(
    () =>
      selManager === ALL_MANAGERS
        ? []
        : taxTargetsAll.filter(c => matchesSelManager(c.manager)),
    [taxTargetsAll, selManager, matchesSelManager],
  );

  const canReorderTargets = !locked && selManager !== ALL_MANAGERS;
  const reorderableTargetIds = useMemo(() => {
    if (!canReorderTargets) return [];
    if (tax === 'comprehensive') {
      return displayedComprehensiveGroups.map(g => g.primaryClientId);
    }
    return displayedTargets.filter(c => !isManualId(c.id)).map(c => c.id);
  }, [canReorderTargets, tax, displayedComprehensiveGroups, displayedTargets]);
  const handleTargetOrderCommit = useCallback(
    (nextIds: string[]) => {
      if (!canReorderTargets) return;
      commitFilingCheckClientReorder(
        selManager,
        orderTaxKey,
        nextIds,
        managerScopedClients,
        clientListSort,
      );
      setClientOrderVersion(v => v + 1);
      if (tax === 'comprehensive') {
        setGroupDisplayOrder(prev => {
          const primaryToGroup = new Map(
            comprehensiveGroups.map(g => [g.primaryClientId, g.groupKey]),
          );
          const nextGroupKeys = nextIds
            .map(id => primaryToGroup.get(id))
            .filter((k): k is string => !!k);
          const tail = prev.filter(k => !nextGroupKeys.includes(k));
          return [...nextGroupKeys, ...tail];
        });
      } else {
        setTargetDisplayOrder(prev => {
          const tail = prev.filter(id => !nextIds.includes(id));
          return [...nextIds, ...tail];
        });
      }
    },
    [
      canReorderTargets,
      selManager,
      orderTaxKey,
      tax,
      managerScopedClients,
      clientListSort,
      comprehensiveGroups,
    ],
  );
  const { orderedIds: reorderableOrderedIds, moveTo } =
    useTriangleListReorder(reorderableTargetIds, handleTargetOrderCommit);
  const [draggingTargetId, setDraggingTargetId] = useState<string | null>(null);
  const targetDragRef = useRef<{
    id: string;
    moved: boolean;
    longPress: boolean;
    timer: number | null;
    startX: number;
    startY: number;
    pointerId: number;
    el: HTMLElement;
  } | null>(null);
  const suppressTargetClickRef = useRef(false);

  const endTargetDrag = useCallback(() => {
    if (targetDragRef.current?.timer) {
      window.clearTimeout(targetDragRef.current.timer);
    }
    const drag = targetDragRef.current;
    if (drag?.longPress) {
      try {
        drag.el.releasePointerCapture(drag.pointerId);
      } catch {
        /* noop */
      }
    }
    targetDragRef.current = null;
    setDraggingTargetId(null);
  }, []);

  const handleTargetPointerDown = useCallback((e: React.PointerEvent<HTMLElement>, id: string) => {
    if (!canReorderTargets) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 즉시 capture하면 업체명 클릭이 먹히므로, 길게 누른 뒤에만 capture
    suppressTargetClickRef.current = false;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const timer = window.setTimeout(() => {
      if (targetDragRef.current?.id === id) {
        targetDragRef.current.longPress = true;
        suppressTargetClickRef.current = true;
        setDraggingTargetId(id);
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* noop */
        }
      }
    }, FILING_LONG_PRESS_MS);
    targetDragRef.current = {
      id,
      moved: false,
      longPress: false,
      timer,
      startX: e.clientX,
      startY: e.clientY,
      pointerId,
      el,
    };
  }, [canReorderTargets]);

  const handleTargetPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = targetDragRef.current;
    if (!drag) return;
    if (
      Math.abs(e.clientX - drag.startX) > FILING_MOVE_THRESHOLD ||
      Math.abs(e.clientY - drag.startY) > FILING_MOVE_THRESHOLD
    ) {
      drag.moved = true;
    }
    if (!drag.longPress) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const target = el?.closest('[data-filing-reorder-id]') as HTMLElement | null;
    const overId = target?.getAttribute('data-filing-reorder-id');
    if (!overId || overId === drag.id) return;
    moveTo(drag.id, overId);
  }, [moveTo]);

  const handleTargetPointerUp = useCallback(() => {
    if (targetDragRef.current?.longPress) {
      suppressTargetClickRef.current = true;
    }
    endTargetDrag();
  }, [endTargetDrag]);

  const displayedComprehensiveGroupsOrdered = useMemo(() => {
    if (!canReorderTargets || tax !== 'comprehensive') return displayedComprehensiveGroups;
    const byPrimary = new Map(displayedComprehensiveGroups.map(g => [g.primaryClientId, g]));
    return reorderableOrderedIds
      .map(id => byPrimary.get(id))
      .filter((g): g is ComprehensiveFilingGroup => !!g);
  }, [canReorderTargets, tax, displayedComprehensiveGroups, reorderableOrderedIds]);

  const displayedTargetsForTable = useMemo(() => {
    if (!canReorderTargets || tax === 'comprehensive') return displayedTargets;
    const reorderable = displayedTargets.filter(c => !isManualId(c.id));
    const manual = displayedTargets.filter(c => isManualId(c.id));
    const byId = new Map(reorderable.map(c => [c.id, c]));
    const ordered = reorderableOrderedIds
      .map(id => byId.get(id))
      .filter((c): c is ClientRecord => !!c);
    return [...ordered, ...manual];
  }, [canReorderTargets, tax, displayedTargets, reorderableOrderedIds]);

  const reviewFeeAmountForClient = useCallback(
    (c: ClientRecord): number | null => {
      if (tax === 'vat') {
        return readVatFilingFee(
          c.intakeData,
          vatProgressPeriodKey(period.year, period.vatPhase),
        );
      }
      if (tax === 'comprehensive' || tax === 'corporate') {
        const v = reviewFeeByClientId[c.id];
        return v == null || !Number.isFinite(v) ? null : v;
      }
      return null;
    },
    [tax, period.year, period.vatPhase, reviewFeeByClientId],
  );

  const formatReviewFee = (amount: number | null | undefined) => {
    if (amount == null || !Number.isFinite(amount)) return '—';
    return `${amount.toLocaleString('ko-KR')}`;
  };

  const feeFilterLabel = (key: string) => {
    if (key === COLUMN_FILTER_EMPTY) return '미입력';
    return `${Number(key).toLocaleString('ko-KR')}원`;
  };

  const filingRowFilterValues = useCallback(
    (c: ClientRecord) => {
      const excluded = excludeReasonOf(c) !== null;
      const vatObligation = tax === 'vat' ? readVatObligation(c, period.vatPhase) : null;
      const vatNoticeOnly = vatObligation === '예정고지';
      const vatSummaryOnly = tax === 'vat' && isVatSummaryOnlyClient(c);
      const skipReceipt = vatNoticeOnly || vatSummaryOnly;
      const received = !excluded && !skipReceipt && isReceived(c.id, c.businessNo);
      const receipt = skipReceipt
        ? vatSummaryOnly
          ? '합계표제출'
          : '예정고지'
        : excluded
          ? '제외'
          : received
            ? '접수완료'
            : '미접수';
      let kind = '일반';
      if (tax === 'vat') {
        if (vatSummaryOnly) kind = '합계표제출';
        else if (isSimplifiedVatClient(c)) kind = '간이';
      }
      const closure = filingClosureNotice(c) || '정상';
      const note = excluded
        ? (excludeReasonOf(c) ?? '').trim() || COLUMN_FILTER_EMPTY
        : (record.rowNotes[c.id] ?? '').trim() || COLUMN_FILTER_EMPTY;
      const fee = reviewFeeAmountForClient(c);
      return {
        receipt,
        fee: fee == null ? COLUMN_FILTER_EMPTY : String(fee),
        company: c.companyName?.trim() || '(이름없음)',
        bizNo: c.businessNo?.trim() || COLUMN_FILTER_EMPTY,
        kind,
        closure,
        note,
        exclude: excluded ? '제외' : '대상',
        obligation: vatObligation || COLUMN_FILTER_EMPTY,
        filingType:
          tax === 'withholding'
            ? String((c.intakeData as { filingType?: string } | undefined)?.filingType ?? '당월')
            : COLUMN_FILTER_EMPTY,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tax,
      period.vatPhase,
      period.year,
      record.excluded,
      record.overrides,
      record.rowNotes,
      excelSet,
      vatProvisional,
      reviewFeeAmountForClient,
    ],
  );

  const filteredTargetsForTable = useMemo(() => {
    const f = colFilters.filters;
    return displayedTargetsForTable.filter(c => {
      const v = filingRowFilterValues(c);
      if (!matchesColumnFilter(f.receipt, v.receipt)) return false;
      if (showsReviewFeeColumn && !matchesColumnFilter(f.fee, v.fee)) return false;
      if (!matchesColumnFilter(f.company, v.company)) return false;
      if (!matchesColumnFilter(f.bizNo, v.bizNo)) return false;
      if (tax === 'vat' && !matchesColumnFilter(f.kind, v.kind)) return false;
      if (!matchesColumnFilter(f.closure, v.closure)) return false;
      if (!matchesColumnFilter(f.note, v.note)) return false;
      if (!matchesColumnFilter(f.exclude, v.exclude)) return false;
      if (vatProvisional && !matchesColumnFilter(f.obligation, v.obligation)) return false;
      if (tax === 'withholding' && !matchesColumnFilter(f.filingType, v.filingType)) return false;
      return true;
    });
  }, [
    displayedTargetsForTable,
    colFilters.filters,
    filingRowFilterValues,
    tax,
    vatProvisional,
    showsReviewFeeColumn,
  ]);

  const targetColumnFilterOptions = useMemo(() => {
    const rows = displayedTargetsForTable.map(c => filingRowFilterValues(c));
    return {
      receipt: buildColumnFilterOptions(rows.map(r => r.receipt)),
      fee: buildColumnFilterOptions(
        rows.map(r => r.fee),
        {
          labelOf: feeFilterLabel,
          sortKeys: (a, b) => {
            if (a === COLUMN_FILTER_EMPTY) return -1;
            if (b === COLUMN_FILTER_EMPTY) return 1;
            return Number(a) - Number(b);
          },
        },
      ),
      company: buildColumnFilterOptions(rows.map(r => r.company)),
      bizNo: buildColumnFilterOptions(rows.map(r => r.bizNo)),
      kind: buildColumnFilterOptions(rows.map(r => r.kind)),
      closure: buildColumnFilterOptions(rows.map(r => r.closure)),
      note: buildColumnFilterOptions(rows.map(r => r.note), {
        labelOf: k => (k === COLUMN_FILTER_EMPTY ? '미입력' : k),
      }),
      exclude: buildColumnFilterOptions(rows.map(r => r.exclude)),
      obligation: buildColumnFilterOptions(rows.map(r => r.obligation)),
      filingType: buildColumnFilterOptions(rows.map(r => r.filingType)),
    };
  }, [displayedTargetsForTable, filingRowFilterValues]);

  const filteredComprehensiveGroupsOrdered = useMemo(() => {
    const f = colFilters.filters;
    return displayedComprehensiveGroupsOrdered.filter(g => {
      const primary = g.clients[0];
      if (!primary) return false;
      const excluded = excludeReasonOf(primary) !== null;
      const received = !excluded && isGroupReceived(g);
      const receipt = excluded ? '제외' : received ? '접수완료' : '미접수';
      const company = primary.companyName?.trim() || g.representative?.trim() || '(이름없음)';
      const closure =
        filingClosureNotice(primary) ??
        g.clients.map(c => filingClosureNotice(c)).find(Boolean) ??
        '정상';
      const note = excluded
        ? (excludeReasonOf(primary) ?? '').trim() || COLUMN_FILTER_EMPTY
        : (record.rowNotes[primary.id] ?? '').trim() || COLUMN_FILTER_EMPTY;
      if (!matchesColumnFilter(f.receipt, receipt)) return false;
      if (
        showsReviewFeeColumn &&
        !matchesColumnFilter(
          f.fee,
          (() => {
            const fee = reviewFeeAmountForClient(primary);
            return fee == null ? COLUMN_FILTER_EMPTY : String(fee);
          })(),
        )
      ) {
        return false;
      }
      if (!matchesColumnFilter(f.company, company)) return false;
      if (!matchesColumnFilter(f.closure, closure)) return false;
      if (!matchesColumnFilter(f.note, note)) return false;
      if (!matchesColumnFilter(f.exclude, excluded ? '제외' : '대상')) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayedComprehensiveGroupsOrdered,
    colFilters.filters,
    record.excluded,
    record.rowNotes,
    record.overrides,
    excelSet,
    showsReviewFeeColumn,
    reviewFeeAmountForClient,
  ]);

  const comprehensiveColumnFilterOptions = useMemo(() => {
    const rows = displayedComprehensiveGroupsOrdered.map(g => {
      const primary = g.clients[0];
      const excluded = primary ? excludeReasonOf(primary) !== null : false;
      const received = primary ? !excluded && isGroupReceived(g) : false;
      const fee = primary ? reviewFeeAmountForClient(primary) : null;
      return {
        receipt: excluded ? '제외' : received ? '접수완료' : '미접수',
        fee: fee == null ? COLUMN_FILTER_EMPTY : String(fee),
        company: primary?.companyName?.trim() || g.representative?.trim() || '(이름없음)',
        closure:
          (primary && filingClosureNotice(primary)) ||
          g.clients.map(c => filingClosureNotice(c)).find(Boolean) ||
          '정상',
        note: primary
          ? excluded
            ? (excludeReasonOf(primary) ?? '').trim() || COLUMN_FILTER_EMPTY
            : (record.rowNotes[primary.id] ?? '').trim() || COLUMN_FILTER_EMPTY
          : COLUMN_FILTER_EMPTY,
        exclude: excluded ? '제외' : '대상',
      };
    });
    return {
      receipt: buildColumnFilterOptions(rows.map(r => r.receipt)),
      fee: buildColumnFilterOptions(
        rows.map(r => r.fee),
        {
          labelOf: feeFilterLabel,
          sortKeys: (a, b) => {
            if (a === COLUMN_FILTER_EMPTY) return -1;
            if (b === COLUMN_FILTER_EMPTY) return 1;
            return Number(a) - Number(b);
          },
        },
      ),
      company: buildColumnFilterOptions(rows.map(r => r.company)),
      closure: buildColumnFilterOptions(rows.map(r => r.closure)),
      note: buildColumnFilterOptions(rows.map(r => r.note), {
        labelOf: k => (k === COLUMN_FILTER_EMPTY ? '미입력' : k),
      }),
      exclude: buildColumnFilterOptions(rows.map(r => r.exclude)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedComprehensiveGroupsOrdered, record.excluded, record.rowNotes, reviewFeeAmountForClient]);

  const filteredReviewFeeTotal = useMemo(() => {
    if (!showsReviewFeeColumn) return null;
    const clientsForFee =
      tax === 'comprehensive'
        ? filteredComprehensiveGroupsOrdered
            .map(g => g.clients[0])
            .filter((c): c is ClientRecord => !!c)
        : filteredTargetsForTable;
    let sum = 0;
    for (const c of clientsForFee) {
      const fee = reviewFeeAmountForClient(c);
      if (fee != null && Number.isFinite(fee)) sum += fee;
    }
    return sum;
  }, [
    showsReviewFeeColumn,
    tax,
    filteredComprehensiveGroupsOrdered,
    filteredTargetsForTable,
    reviewFeeAmountForClient,
  ]);

  const reviewFeeHeaderSubtitle =
    filteredReviewFeeTotal != null && filteredReviewFeeTotal > 0
      ? `${filteredReviewFeeTotal.toLocaleString('ko-KR')}원`
      : filteredReviewFeeTotal != null
        ? '—'
        : undefined;

  const renderColFilter = (
    key: string,
    label: string,
    options: ReturnType<typeof buildColumnFilterOptions>,
    className?: string,
    extraMenus?: ReactNode,
    subtitle?: ReactNode,
  ) => (
    <ColumnValueFilterHeader
      columnKey={key}
      label={label}
      options={options}
      filter={colFilters.filters[key]}
      open={colFilters.openKey === key}
      onToggleOpen={() => colFilters.toggleOpen(key)}
      onToggleValue={v => colFilters.toggleValue(key, v, options.map(o => o.key))}
      onClear={() => colFilters.clear(key)}
      align="center"
      className={className}
      extraMenus={extraMenus}
      subtitle={subtitle}
    />
  );

  const renderExtraFilterMenu = (
    key: string,
    title: string,
    options: ReturnType<typeof buildColumnFilterOptions>,
  ) => (
    <ColumnFilterMenu
      columnKey={key}
      title={title}
      options={options}
      filter={colFilters.filters[key]}
      open={colFilters.openKey === key}
      onToggleOpen={() => colFilters.toggleOpen(key)}
      onToggleValue={v => colFilters.toggleValue(key, v, options.map(o => o.key))}
      onClear={() => colFilters.clear(key)}
    />
  );

  useEffect(() => {
    if (!focusClientId || focusAppliedRef.current === focusClientId) return;
    const timer = window.setTimeout(() => {
      const row = document.querySelector(`[data-filing-client-id="${focusClientId}"]`);
      if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.add('ring-2', 'ring-inset', 'ring-violet-400', 'bg-violet-50/40');
      focusAppliedRef.current = focusClientId;
      window.setTimeout(() => row.classList.remove('ring-2', 'ring-inset', 'ring-violet-400', 'bg-violet-50/40'), 2500);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [focusClientId, displayedTargetsForTable, displayedComprehensiveGroupsOrdered]);

  const setClientFilingType = async (c: ClientRecord, value: '당월' | '전월') => {
    if (locked) return;
    const extraIdx = record.extraClients.findIndex(m => m.id === c.id);
    if (extraIdx >= 0) {
      const nextExtras = [...record.extraClients];
      nextExtras[extraIdx] = { ...nextExtras[extraIdx]!, filingType: value };
      const nextRecord = { ...record, extraClients: nextExtras };
      setRecord(nextRecord);
      await persistSession(nextRecord, { flush: true });
    }
    if (isManualId(c.id)) return;
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
        body: JSON.stringify({
          intakeData: { filingType: value },
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = (await res.json().catch(() => ({}))) as { client?: ClientRecord };
      if (data.client?.updatedAt) {
        setAllClients(prev =>
          (prev ?? clients).map(x =>
            x.id === c.id ? { ...x, updatedAt: data.client!.updatedAt, intakeData: nextIntake } : x,
          ),
        );
      }
    } catch {
      setAllClients(prev =>
        (prev ?? clients).map(x =>
          x.id === c.id ? { ...x, intakeData: prevIntake } : x,
        ),
      );
      patchPortalClient(c.id, { intakeData: prevIntake });
    }
  };

  const setClientVatObligation = async (c: ClientRecord, value: VatObligation) => {
    if (isManualId(c.id) || locked) return;
    const prevIntake = c.intakeData ?? {};
    const prevByPhase =
      prevIntake.vatObligationByPhase && typeof prevIntake.vatObligationByPhase === 'object'
        ? (prevIntake.vatObligationByPhase as Record<string, string>)
        : {};
    const bucket = vatObligationBucket(period.vatPhase);
    const phasePatch = { [bucket]: value, [period.vatPhase]: value };
    const nextIntake = {
      ...prevIntake,
      vatObligation: value,
      vatObligationByPhase: { ...prevByPhase, ...phasePatch },
    };
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
        body: JSON.stringify({
          intakeData: {
            vatObligation: value,
            vatObligationByPhase: phasePatch,
          },
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = (await res.json().catch(() => ({}))) as { client?: ClientRecord };
      if (data.client?.updatedAt) {
        setAllClients(prev =>
          (prev ?? clients).map(x =>
            x.id === c.id ? { ...x, updatedAt: data.client!.updatedAt, intakeData: nextIntake } : x,
          ),
        );
      }
    } catch {
      setAllClients(prev =>
        (prev ?? clients).map(x =>
          x.id === c.id ? { ...x, intakeData: prevIntake } : x,
        ),
      );
      patchPortalClient(c.id, { intakeData: prevIntake });
    }
  };

  // 업체 추가 (수임처 검색) — 폐업·해임 포함. 간이지급·연말정산도 동일
  const [showAdd, setShowAdd] = useState(false);

  const addClientFromPicker = (c: ClientRecord) => {
    const alreadyInExtras = record.extraClients.some(m => m.id === c.id);
    if (isIncomeTypeTax) {
      if (alreadyInExtras) {
        window.alert('이미 목록에 추가된 업체입니다.');
        return;
      }
    } else if (targets.some(t => t.id === c.id)) {
      window.alert('이미 목록에 있는 업체입니다.');
      return;
    }
    const m: ManualClient = {
      id: c.id,
      companyName: c.companyName,
      businessNo: c.businessNo,
      representative: c.representative || undefined,
      filingType: readFilingType(c.intakeData),
    };
    const nextExtras = alreadyInExtras ? record.extraClients : [...record.extraClients, m];
    const nextRecord = { ...record, extraClients: nextExtras };
    setRecord(nextRecord);
    setTargetDisplayOrder(prev => (prev.includes(c.id) ? prev : [...prev, c.id]));
    void (async () => {
      await persistSession(nextRecord, { flush: true });
      if (isIncomeTypeTax) {
        await incomeSectionRef.current?.reload();
      }
    })();
  };

  const clientAddBar =
    !locked ? (
      <div className="relative z-40 mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAdd(v => !v)}
          className={portalBtnSecondary}
        >
          {showAdd ? '닫기' : '+ 업체 추가'}
        </button>
        {showAdd && (
          <div className="flex min-w-[16rem] flex-1 flex-wrap items-center gap-2">
            <FilingCheckClientAdd onSelect={addClientFromPicker} disabled={locked} />
            <span className="text-xs text-slate-400">
              유출·폐업 수임처도 검색·유지됩니다. 목록에 「유출된 사업장입니다」로 표시됩니다.
            </span>
          </div>
        )}
      </div>
    ) : null;

  const removeExtraClient = (id: string) => {
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
    const targetBiz = new Set(
      activeTargets.map(c => normalizeBizNo(c.businessNo)).filter(Boolean),
    );
    let n = 0;
    for (const b of excelSet) if (!targetBiz.has(b)) n += 1;
    return n;
  }, [excelSet, activeTargets]);

  const [uploadAddedNames, setUploadAddedNames] = useState<string[]>([]);

  const missingFromListNames = useMemo(() => {
    if (excelSet.size === 0) return [] as string[];
    const targetBiz = new Set(
      activeTargets.map(c => normalizeBizNo(c.businessNo)).filter(Boolean),
    );
    const nameByBiz = new Map<string, string>();
    for (const [biz, name] of Object.entries(record.excelNamesByBiz ?? {})) {
      if (biz && name?.trim()) nameByBiz.set(biz, name.trim());
    }
    for (const c of targets) {
      const b = normalizeBizNo(c.businessNo);
      if (b && !nameByBiz.has(b)) nameByBiz.set(b, c.companyName || '(이름없음)');
    }
    for (const s of record.specialFilings) {
      const b = normalizeBizNo(s.bizNo);
      if (b && s.name?.trim() && !nameByBiz.has(b)) nameByBiz.set(b, s.name.trim());
    }
    const names: string[] = [];
    for (const b of excelSet) {
      if (targetBiz.has(b)) continue;
      // 이번 업로드로 이미 추가한 상호는 missing에서 제외
      const label = nameByBiz.get(b) || b;
      if (uploadAddedNames.includes(label)) continue;
      names.push(label);
    }
    return names;
  }, [
    excelSet,
    activeTargets,
    targets,
    record.excelNamesByBiz,
    record.specialFilings,
    uploadAddedNames,
  ]);

  /** 활성 리스트에 있으나 접수(체크)되지 않은 상호 */
  const noReceiptNames = useMemo(() => {
    if (excelSet.size === 0) return [] as string[];
    if (tax === 'comprehensive') {
      return (notReceived as ComprehensiveFilingGroup[]).map(
        g => g.representative || '(이름없음)',
      );
    }
    return (notReceived as ClientRecord[]).map(c => c.companyName || '(이름없음)');
  }, [excelSet, notReceived, tax]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    try {
      const { bizNos, filings } = await parseHometaxFile(file);
      const special = extractSpecialFilings(filings);
      const excelBizCounts = countHometaxFilingsByBiz(filings);
      const excelNamesByBiz: Record<string, string> = {};
      for (const f of filings) {
        const biz = normalizeBizNo(f.bizNo);
        if (biz.length === 10 && f.name?.trim() && !excelNamesByBiz[biz]) {
          excelNamesByBiz[biz] = f.name.trim();
        }
      }

      const fileBizSet = new Set(bizNos.filter(b => b.length === 10));
      // 현재 담당자 수임처만 매칭 — 타 담당 업체가 extraClients로 섞이지 않게
      const managerScopedClients =
        selManager === ALL_MANAGERS
          ? clients
          : clients.filter(c => matchesSelManager(c.manager));
      const clientByBiz = new Map<string, ClientRecord>();
      for (const c of managerScopedClients) {
        const b = normalizeBizNo(c.businessNo);
        if (b.length === 10 && !clientByBiz.has(b)) clientByBiz.set(b, c);
      }

      const activeBiz = new Set(
        activeTargets.map(c => normalizeBizNo(c.businessNo)).filter(Boolean),
      );
      const nextExcluded = { ...record.excluded };
      const nextForce = { ...(record.forceIncluded ?? {}) };
      // 타 담당으로 잘못 들어간 extra 정리
      const nextExtra = record.extraClients.filter(m => {
        const full = clients.find(c => c.id === m.id);
        if (!full) return selManager === ALL_MANAGERS;
        if (selManager === ALL_MANAGERS) return true;
        return matchesSelManager(full.manager);
      });
      const nextOrder = [...targetDisplayOrder];
      const added: string[] = [];

      for (const biz of fileBizSet) {
        if (activeBiz.has(biz)) continue;
        const client = clientByBiz.get(biz);
        const displayName = client?.companyName || excelNamesByBiz[biz] || biz;
        if (!client) continue;

        let changed = false;
        if (Object.prototype.hasOwnProperty.call(nextExcluded, client.id)) {
          delete nextExcluded[client.id];
          changed = true;
        }
        // 반기 자동제외 등이면 수기 강제포함으로 살려서 접수 체크 가능하게
        const wouldAutoExclude =
          tax === 'withholding' &&
          isSemiAnnualOffMonthExcluded(client.intakeData ?? {}, attribution.month) &&
          !nextForce[client.id];
        if (wouldAutoExclude) {
          nextForce[client.id] = true;
          changed = true;
        }
        const alreadyTarget =
          targets.some(t => t.id === client.id) || nextExtra.some(e => e.id === client.id);
        // 「전체」세션에는 extra 적재하지 않음 — 담당자별 세션에서만 추가
        if (!alreadyTarget && selManager !== ALL_MANAGERS) {
          nextExtra.push({
            id: client.id,
            companyName: client.companyName,
            businessNo: client.businessNo,
            representative: client.representative || undefined,
          });
          if (!nextOrder.includes(client.id)) nextOrder.push(client.id);
          changed = true;
        }
        if (changed) added.push(displayName);
      }

      // 이전에 적어둔 사유 중 이번에도 존재하는 항목은 보존
      const keptReasons: Record<string, string> = {};
      for (const s of special) {
        const k = specialFilingKey(s.bizNo, s.type);
        if (record.specialReasons[k]) keptReasons[k] = record.specialReasons[k];
      }
      for (const [k, v] of Object.entries(record.specialReasons)) {
        if (!k.endsWith('|복수접수') || !v?.trim()) continue;
        const biz = k.slice(0, -'|복수접수'.length);
        if ((excelBizCounts[biz] ?? 0) > 1) keptReasons[k] = v;
      }
      setUploadAddedNames(added);
      setTargetDisplayOrder(nextOrder);
      patchRecord({
        excelBizNos: bizNos,
        excelNamesByBiz,
        excelBizCounts,
        overrides: {},
        fileName: file.name,
        done: false,
        specialFilings: special,
        specialReasons: keptReasons,
        excluded: nextExcluded,
        forceIncluded: nextForce,
        extraClients: nextExtra,
      });
    } catch {
      setParseError('엑셀을 읽지 못했습니다. 홈택스 접수목록 파일(.xlsx/.xls)인지 확인해 주세요.');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
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
      `[신고접수검토] ${taxLabel} · ${periodLabel(tax, period)} · ${mgrLabel}`,
      vatProvisional
        ? `· 신고대상: ${targetCount}곳 · 예정고지: ${vatNoticeTargetCount}곳`
        : `· 신고대상: ${statTarget}곳`,
      `· 접수완료: ${statReceived}${hasExcelReceipt && !isIncomeTypeTax ? '건' : '곳'}`,
      `· 차이: ${statDiff}${hasExcelReceipt && !isIncomeTypeTax ? '건' : '곳'}`,
    ];
    const note = record.diffReason.trim();
    if (statDiff !== 0) {
      // 복수접수 사유로 설명되면 상위 '차이 사유: 미기재'는 내지 않음
      if (note) {
        lines.push(`· 차이 사유: ${note}`);
      } else if (multiFilings.length === 0) {
        lines.push('· 차이 사유: 미기재');
      }
    } else if (note) {
      lines.push(`· 특이사항: ${note}`);
    }
    if (multiFilings.length > 0) {
      lines.push('· 복수 접수');
      for (const m of multiFilings) {
        const reason = record.specialReasons[multiFilingReasonKey(m.bizNo)]?.trim();
        lines.push(
          `  - ${m.name || m.bizNo} 접수 ${m.count}건${reason ? ` (${reason})` : ' (사유 미기재)'}`,
        );
      }
    }
    if (record.specialFilings.length > 0) {
      lines.push('· 수정·기한후·경정청구 신고');
      for (const s of record.specialFilings) {
        const reason = record.specialReasons[specialFilingKey(s.bizNo, s.type)]?.trim();
        lines.push(`  - ${s.name || s.bizNo} ${s.type} ${s.count}건${reason ? ` (${reason})` : ''}`);
      }
    }
    if (!isIncomeTypeTax) {
      if (vatSummaryOnlyTargets.length > 0) {
        lines.push(`· 합계표제출 ${vatSummaryOnlyTargets.length}곳 (접수목록 검증 제외)`);
        for (const c of vatSummaryOnlyTargets) {
          lines.push(`  - ${c.companyName || c.representative || '(이름없음)'}`);
        }
      }
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
      if (uploadAddedNames.length > 0) {
        lines.push(`· ${formatCompanyNameList(uploadAddedNames)} 리스트에 없어 추가하였습니다.`);
      }
      if (missingFromListNames.length > 0) {
        lines.push(`· ${formatCompanyNameList(missingFromListNames)} 리스트에 없습니다.`);
      }
      if (noReceiptNames.length > 0) {
        lines.push(`· ${formatCompanyNameList(noReceiptNames)} 접수내역이 없습니다.`);
      }
    } else if (incomeUploaded && incomeStats.unreceivedByColumn.length > 0) {
      for (const col of incomeStats.unreceivedByColumn) {
        lines.push(
          `· ${col.label} ${formatCompanyNameList(col.names)} 접수내역이 없습니다.`,
        );
      }
    }
    if (periodCompare) {
      if (periodCompare.byColumn && periodCompare.byColumn.length > 0) {
        lines.push(
          `· ${compareLabels.title} 합계: ${periodCompare.prevCount}건 → ${periodCompare.currCount}건 (${periodCompare.diff >= 0 ? '+' : ''}${periodCompare.diff})`,
        );
        for (const col of periodCompare.byColumn) {
          if (col.diff === 0 && col.changedClients.length === 0) continue;
          lines.push(
            `· ${col.label} (${col.prevPeriodLabel}): ${col.prevCount}건 → ${col.currCount}건 (${col.diff >= 0 ? '+' : ''}${col.diff})`,
          );
          for (const c of col.changedClients) {
            lines.push(
              `  - ${c.companyName}${c.change === 'added' ? ' (추가)' : ' (제외)'}`,
            );
          }
        }
      } else {
        lines.push(
          `· ${compareLabels.title}: ${periodCompare.prevCount}${tax === 'simplePayroll' ? '건' : '곳'} → ${periodCompare.currCount}${tax === 'simplePayroll' ? '건' : '곳'} (${periodCompare.diff >= 0 ? '+' : ''}${periodCompare.diff})`,
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
    vatNoticeTargetCount,
    vatProvisional,
    receivedCount,
    diff,
    record.diffReason,
    record.specialFilings,
    record.specialReasons,
    multiFilings,
    record.excluded,
    record.rowNotes,
    activeTargets,
    excludedTargetsForSummary,
    vatSummaryOnlyTargets,
    missingFromListNames,
    noReceiptNames,
    uploadAddedNames,
    incomeUploaded,
    periodCompare,
    compareLabels,
  ]);

  const copySummary = async () => {
    const plain = summary.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const html = summary
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => `<div>${line ? escapeHtml(line) : '<br>'}</div>`)
      .join('');
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plain], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
    }
  };

  const mergeHometaxSpecialFilings = async (file: File) => {
    const { bizNos, filings } = await parseHometaxFile(file);
    const special = extractSpecialFilings(filings);
    const excelBizCounts = countHometaxFilingsByBiz(filings);
    const keptReasons: Record<string, string> = {};
    for (const s of special) {
      const k = specialFilingKey(s.bizNo, s.type);
      if (record.specialReasons[k]) keptReasons[k] = record.specialReasons[k];
    }
    for (const [k, v] of Object.entries(record.specialReasons)) {
      if (!k.endsWith('|복수접수') || !v?.trim()) continue;
      const biz = k.slice(0, -'|복수접수'.length);
      if ((excelBizCounts[biz] ?? 0) > 1) keptReasons[k] = v;
    }
    patchRecord({
      excelBizNos: bizNos,
      excelBizCounts,
      specialFilings: special,
      specialReasons: keptReasons,
      fileName: file.name,
    });
  };

  const completionFooter = (diffValue: number) => (
    <>
      {tax === 'vat' && vatSummaryOnlyTargets.length > 0 && (
        <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
          <p className="text-xs font-bold text-violet-800">
            합계표제출 {vatSummaryOnlyTargets.length}곳 — 접수목록 검증 제외
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-violet-900">
            {vatSummaryOnlyTargets.map(c => (
              <li key={c.id}>· {c.companyName || c.representative || '(이름없음)'}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-violet-700/90">
            완료 처리 시 요약(블루홀 공유용)에도 함께 포함됩니다.
          </p>
        </div>
      )}
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
            {diffValue !== 0 &&
              !record.diffReason.trim() &&
              !(multiFilings.length > 0 && !multiFilingMissingReason) && (
              <span className="text-xs text-rose-500">
                신고대상과 접수완료에 {diffValue}건 차이가 있습니다. 사유를 적으면 요약에 함께 들어갑니다.
              </span>
            )}
            {multiFilingMissingReason && (
              <span className="text-xs text-violet-600">
                복수 접수 업체 사유를 위에 적어 주세요.
              </span>
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
      compareCountUnit={tax === 'simplePayroll' ? '건' : '곳'}
      record={record}
      parseError={parseError}
      multiFilings={tax === 'withholding' ? multiFilings : []}
      onPatch={patchRecord}
      onSetSpecialReason={setSpecialReason}
    />
  );

  // 안내문구 생성기와 동일하게 2025년부터 10년치
  const years = Array.from({ length: 10 }, (_, i) => 2025 + i);
  const hometaxUploadBusy = isIncomeTypeTax ? incomeParsing : parsing;
  const hometaxUploadDisabled = hometaxUploadBusy || locked;

  return (
    <PortalPageShell>
      <div className={`${portalStickyBar} -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-3 mb-3 space-y-3`}>
      <PortalPageHeader
        title="신고접수검토"
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
              disabled={blockingLoading}
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-sm font-bold transition-all ${
                active
                  ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50'
              } disabled:cursor-wait disabled:opacity-60`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {(blockingLoading || sessionLoading) && (
        <div
          className="mb-3 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800"
          role="status"
          aria-live="polite"
        >
          <div
            className="h-5 w-5 shrink-0 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin"
            aria-hidden
          />
          <div>
            <p>
              {blockingLoading
                ? '신고접수검토 불러오는 중…'
                : '신고 기록 불러오는 중…'}
            </p>
            <p className="mt-0.5 text-xs font-normal text-blue-600/90">
              잠시만 기다려 주세요. 오류가 아닙니다.
            </p>
          </div>
        </div>
      )}

      {/* 담당자 선택 — 전체 조회 권한(인디·개발자 관리자) */}
      {isMaster && !blockingLoading && (
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
                : vatProvisional
                  ? vatAllFilingCount
                  : taxTargetsAll.length
              : (managerCounts.get(name) ?? 0);
            const noticeCount = vatProvisional && !isAll ? (vatManagerNoticeCounts.get(name) ?? 0) : 0;
            const allNoticeCount = vatProvisional && isAll ? vatAllNoticeCount : 0;
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
                {!isAll && (
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 ${managerChipColor(name, MANAGER_LEGEND_ORDER)}`}
                    aria-hidden
                  />
                )}
                {name}
                {self && <span className="text-[9px] font-bold text-blue-500">나</span>}
                <span
                  className={`min-w-[1rem] rounded px-1 py-px text-center text-[10px] font-semibold tabular-nums ${
                    active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}
                  title={vatProvisional ? '신고대상' : undefined}
                >
                  {count}
                </span>
                {vatProvisional && (
                  <span
                    className={`min-w-[1rem] rounded px-1 py-px text-center text-[10px] font-semibold tabular-nums ${
                      active ? 'bg-violet-100 text-violet-700' : 'bg-violet-50 text-violet-600'
                    }`}
                    title="예정고지 대상"
                  >
                    {isAll ? allNoticeCount : noticeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* 기간 + 엑셀 업로드 */}
      {!blockingLoading && (
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
          <>
          <select
            value={period.month}
            onChange={e => setPeriod(p => ({ ...p, month: Number(e.target.value) }))}
            className={inputCls}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {m}월 신고
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {attribution.month}월 귀속 · 마감 매월 10일(휴일 시 다음 평일)
          </span>
          </>
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
        {tax === 'corporate' && (
          <select
            value={period.corpPhase}
            onChange={e => setPeriod(p => ({ ...p, corpPhase: e.target.value as CorpPhase }))}
            className={inputCls}
          >
            {CORP_PHASES.map(ph => (
              <option key={ph} value={ph}>
                {ph}
              </option>
            ))}
          </select>
        )}
        {tax === 'simplePayroll' && employedFilingMonth && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
            근로 반기 신고월 (1·7월)
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
            id={hometaxFileInputId}
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            disabled={hometaxUploadDisabled}
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
                  .then(() => {
                    setIncomeUploaded(true);
                    showIncomeSavedTick();
                  })
                  .catch(err => {
                    setIncomeNotice(err instanceof Error ? err.message : '엑셀 처리 실패');
                  })
                  .finally(() => {
                    setIncomeParsing(false);
                    if (fileRef.current) fileRef.current.value = '';
                  });
              } else {
                void handleUpload(f);
              }
            }}
          />
          {/* label+htmlFor: display:none 입력의 프로그래밍 click이 막히는 환경 대비 */}
          <label
            htmlFor={hometaxFileInputId}
            className={`${portalBtnSecondary} ${
              hometaxUploadDisabled
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer'
            }`}
            title={
              locked
                ? '완료 상태입니다. 완료 취소 후 업로드하세요.'
                : hometaxUploadBusy
                  ? '파일을 읽는 중입니다.'
                  : '홈택스 접수목록 엑셀(.xlsx/.xls) 선택'
            }
            aria-disabled={hometaxUploadDisabled}
          >
            {hometaxUploadBusy ? '읽는 중…' : '홈택스 접수목록 업로드'}
          </label>
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
                setUploadAddedNames([]);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className={portalBtnSecondary}
            >
              접수 초기화
            </button>
          )}
          {isIncomeTypeTax &&
            !locked &&
            incomeStats.received > 0 && (
            <button
              type="button"
              onClick={() => {
                const reset = incomeSectionRef.current?.resetReceipt;
                if (!reset) return;
                void reset()
                  .then(() => {
                    setIncomeNotice('');
                    setIncomeUploaded(false);
                    if (fileRef.current) fileRef.current.value = '';
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
      )}
      </div>

      {blockingLoading ? (
        <PortalLoading
          label={
            pageBootLoading
              ? '로그인 정보 확인 중…'
              : '수임처 목록 불러오는 중…'
          }
        />
      ) : isIncomeTypeTax ? (
        <>
          {incomeNotice && (
            <p className={`${portalAlertInfo} mb-4 whitespace-pre-line`}>{incomeNotice}</p>
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
          {incomeUploaded && incomeStats.unreceivedByColumn.length > 0 && (
            <div className={`${portalAlertInfo} mb-4 space-y-1 border-rose-200 bg-rose-50 text-rose-800`}>
              {incomeStats.unreceivedByColumn.map(col => (
                <p key={col.key}>
                  <span className="font-semibold text-rose-900">{col.label}</span>{' '}
                  <span className="font-semibold text-rose-900">
                    {formatCompanyNameList(col.names)}
                  </span>{' '}
                  접수내역이 없습니다.
                </p>
              ))}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ScopeToggle
              value={listScope === 'targets' ? 'mine' : 'all'}
              onChange={v => setListScope(v === 'mine' ? 'targets' : 'all')}
              mineLabel="신고대상"
              allLabel="전체"
            />
            {listScope === 'targets' && incomeStats.excludedRows > 0 && (
              <span className="text-xs text-slate-500">
                원천 제외 {incomeStats.excludedRows}곳 — 활성 칸이 있으면 신고대상·차이에 포함, 없으면
                「전체」에서 확인
              </span>
            )}
            {listScope === 'all' && incomeStats.excludedRows > 0 && (
              <span className="text-xs text-slate-500">
                원천 제외 {incomeStats.excludedRows}곳 — 활성·미접수면 차이에 포함됩니다
              </span>
            )}
          </div>
          {clientAddBar}
          <IncomeTypeFilingSection
            ref={incomeSectionRef}
            mode={tax === 'simplePayroll' ? 'simplePayroll' : 'yearEnd'}
            manager={selManager}
            clients={clients}
            year={attribution.year}
            month={attribution.month}
            onYearChange={y => {
              const report = reportMonthFromAttributionMonth(y, attribution.month);
              setPeriod(p => ({ ...p, year: report.year, month: report.month }));
            }}
            onMonthChange={m => {
              const report = reportMonthFromAttributionMonth(attribution.year, m);
              setPeriod(p => ({ ...p, year: report.year, month: report.month }));
            }}
            embedded
            locked={locked}
            rowFilter={statFilter}
            listScope={listScope}
            withholdingOrderIds={withholdingOrderIds}
            onPeriodCompareChange={setSpPeriodCompare}
            onStatsChange={setIncomeStats}
            onUploadNotice={setIncomeNotice}
            onEmployedFilingMonth={setEmployedFilingMonth}
            onSaved={showIncomeSavedTick}
            onSetRowNote={patchWithholdingRowNote}
            onSetExcludeReason={patchWithholdingExcludeReason}
          />
          {incomeStats.target > 0 && incomeStats.received > 0 && (
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
      <div className={`mb-4 grid gap-3 ${vatProvisional ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:max-w-md'}`}>
        {vatProvisional ? (
          <>
            <StatCard
              label="신고대상(예정신고)"
              value={targetCount}
              tone="border-blue-100 bg-blue-50/60 text-blue-800"
              selected={statFilter === 'target'}
              onClick={() => toggleStatFilter('target')}
            />
            <StatCard
              label="예정고지 대상"
              value={vatNoticeTargetCount}
              tone="border-violet-100 bg-violet-50/60 text-violet-800"
            />
          </>
        ) : (
          <StatCard
            label="신고대상"
            value={targetCount}
            tone="border-blue-100 bg-blue-50/60 text-blue-800"
            selected={statFilter === 'target'}
            onClick={() => toggleStatFilter('target')}
          />
        )}
        <StatCard
          label={hasExcelReceipt ? '접수완료(업로드)' : '접수완료'}
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

      {!isIncomeTypeTax && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ScopeToggle
            value={listScope === 'targets' ? 'mine' : 'all'}
            onChange={v => setListScope(v === 'mine' ? 'targets' : 'all')}
            mineLabel="신고대상"
            allLabel="전체"
          />
          {colFilters.anyActive ? (
            <button type="button" className={portalBtnSecondary} onClick={colFilters.clearAll}>
              열 필터 해제
            </button>
          ) : null}
          {canReorderTargets && (
            <span className="text-[11px] text-slate-400">업체명을 꾹 눌러 순서 변경 (담당자·세목별 전용)</span>
          )}
          {listScope === 'targets' && excludedTargets.length > 0 && (
            <span className="text-xs text-slate-500">
              제외 {excludedTargets.length}곳 · 「전체」에서 제외사유 확인·수정
            </span>
          )}
          {listScope === 'all' && excludedTargets.length > 0 && (
            <span className="text-xs text-slate-500">
              제외 {excludedTargets.length}곳은 목록 하단에 취소선으로 표시됩니다
            </span>
          )}
        </div>
      )}

      {excelSet.size > 0 && (
        <div className={`${portalAlertInfo} mb-4 space-y-1`}>
          <p>
            접수목록 {excelFilingTotal}건
            {excelFilingTotal !== excelSet.size ? ` (${excelSet.size}개 사업자번호)` : ''}을
            사업자번호로 대조했습니다.
            {targetCount > 0 && (
              <>
                {' '}
                신고대상 {targetCount}곳 · 업로드 접수 {receivedCount}건
                {diff > 0 ? ` — ${diff}건 차이가 있습니다.` : ' 건수가 일치합니다.'}
              </>
            )}
          </p>
          {tax === 'withholding' && surplusFilingDiff > 0 && (
            <p className="text-rose-700">
              같은 사업자번호로 접수 행이 2건 이상인 경우 업로드 건수·차이에 반영됩니다.
              (초과 {surplusFilingDiff}건 · 귀속 지급 등)
            </p>
          )}
          {uploadAddedNames.length > 0 && (
            <p>
              <span className="font-semibold text-slate-800">
                {formatCompanyNameList(uploadAddedNames)}
              </span>{' '}
              리스트에 없어 추가하였습니다.
            </p>
          )}
          {missingFromListNames.length > 0 && (
            <p>
              <span className="font-semibold text-slate-800">
                {formatCompanyNameList(missingFromListNames)}
              </span>{' '}
              리스트에 없습니다.
            </p>
          )}
          {noReceiptNames.length > 0 && (
            <p className="text-rose-800">
              <span className="font-semibold text-rose-900">
                {formatCompanyNameList(noReceiptNames)}
              </span>{' '}
              접수내역이 없습니다.
            </p>
          )}
        </div>
      )}

      {/* 업체 추가 */}
      {clientAddBar}

      {/* 대상 목록 */}
      <div className={portalCard}>
        {tax === 'comprehensive' ? (
        <>
          {canReorderTargets && (
            <p className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-400">
              업체명을 꾹 눌러 순서 변경 (담당자·세목별 전용 — 수임처 관리 기준 위에 이 세목만 덮어씀)
            </p>
          )}
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              {renderColFilter('receipt', '접수', comprehensiveColumnFilterOptions.receipt, 'w-12')}
              <th className="sticky top-0 z-20 w-12 whitespace-nowrap bg-slate-50 px-2 py-2 text-center font-semibold shadow-[0_1px_0_0_#e2e8f0]">순번</th>
              {showsReviewFeeColumn
                ? renderColFilter(
                    'fee',
                    '수수료',
                    comprehensiveColumnFilterOptions.fee,
                    'w-24',
                    undefined,
                    reviewFeeHeaderSubtitle,
                  )
                : null}
              <th className="sticky top-0 z-20 w-28 whitespace-nowrap bg-slate-50 px-2 py-2 text-center font-semibold shadow-[0_1px_0_0_#e2e8f0]">대표자명</th>
              <th className="sticky top-0 z-20 w-32 whitespace-nowrap bg-slate-50 px-2 py-2 text-center font-semibold shadow-[0_1px_0_0_#e2e8f0]">주민등록번호</th>
              {renderColFilter(
                'company',
                '상호',
                comprehensiveColumnFilterOptions.company,
                'w-48',
                <>
                  <span className="text-[9px] font-medium text-slate-400">유출</span>
                  {renderExtraFilterMenu('closure', '유출', comprehensiveColumnFilterOptions.closure)}
                </>,
              )}
              {renderColFilter('note', '특이사항(제외사유 등)', comprehensiveColumnFilterOptions.note)}
              {renderColFilter('exclude', '제외', comprehensiveColumnFilterOptions.exclude, 'w-12')}
            </tr>
          </thead>
          <tbody>
            {comprehensiveGroups.length === 0 && record.extraClients.length === 0 ? (
              <tr>
                <td colSpan={comprehensiveColSpan} className="px-3 py-10 text-center text-slate-400">
                  {sessionLoading
                    ? '신고 기록 불러오는 중…'
                    : `${taxLabel} 신고대상 수임처가 없습니다.`}
                </td>
              </tr>
            ) : filteredComprehensiveGroupsOrdered.length === 0 ? (
              <tr>
                <td colSpan={comprehensiveColSpan} className="px-3 py-10 text-center text-slate-400">
                  열 필터 조건에 맞는 업체가 없습니다.
                </td>
              </tr>
            ) : (
              <>
                {filteredComprehensiveGroupsOrdered.map((g, i) => {
                  const primary = g.clients[0];
                  const manualExcluded = isManualExcluded(g.primaryClientId);
                  const reason = excludeReasonOf(primary);
                  const excluded = reason !== null;
                  const closureNotice =
                    filingClosureNotice(primary) ??
                    g.clients.map(c => filingClosureNotice(c)).find(Boolean) ??
                    null;
                  const received = !excluded && isGroupFilingReceived(g);
                  const siteState = groupSiteDoneState(g);
                  const restCount = g.clients.length - 1;
                  const siteLabel = g.displayCompanyLabel;
                  const groupCount = filteredComprehensiveGroupsOrdered.length;
                  return (
                    <tr
                      key={g.groupKey}
                      data-filing-client-id={g.primaryClientId}
                      className={`border-b border-slate-50 ${
                        excluded ? 'bg-slate-50/70' : received ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={received}
                          disabled
                          readOnly
                          className="h-4 w-4 accent-emerald-500 disabled:opacity-40"
                          title="홈택스 접수목록 엑셀 업로드로만 매칭됩니다 (수기 체크 불가)"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <FilingReorderIndexCell
                          index={i}
                        />
                      </td>
                      {showsReviewFeeColumn ? (
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {formatReviewFee(reviewFeeAmountForClient(primary))}
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-center text-sm font-semibold text-slate-800">{g.representative}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums text-slate-600">
                        {formatResidentNoDisplay(g.residentNo)}
                      </td>
                      <td className="max-w-0 px-2 py-2">
                        <div
                          data-filing-reorder-id={canReorderTargets ? g.primaryClientId : undefined}
                          onPointerDown={e => handleTargetPointerDown(e, g.primaryClientId)}
                          onPointerMove={handleTargetPointerMove}
                          onPointerUp={handleTargetPointerUp}
                          onPointerCancel={endTargetDrag}
                          onClickCapture={e => {
                            if (suppressTargetClickRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                              suppressTargetClickRef.current = false;
                            }
                          }}
                          className={`flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap ${
                            draggingTargetId === g.primaryClientId ? 'rounded-md bg-blue-50/80' : ''
                          } ${canReorderTargets ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          style={canReorderTargets ? { touchAction: 'none' } : undefined}
                        >
                          <ComprehensiveGroupReceiveCheckbox
                            checked={siteState.checked}
                            indeterminate={siteState.indeterminate}
                            disabled={excluded || locked}
                            onChange={checked => setGroupSiteDone(g, checked)}
                          />
                          <ReviewLinkedCompanyName
                            clientId={g.primaryClientId}
                            name={siteLabel}
                            title={
                              canReorderTargets
                                ? `${comprehensiveSiteTooltip(g)}\n길게 눌러 순서 변경`
                                : comprehensiveSiteTooltip(g)
                            }
                            shouldSuppressClick={() => suppressTargetClickRef.current}
                            className={
                              excluded
                                ? 'min-w-0 truncate font-medium text-slate-400 line-through'
                                : siteState.checked
                                  ? 'min-w-0 truncate font-medium text-emerald-700'
                                  : 'min-w-0 truncate font-medium text-slate-800'
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
                          {closureNotice && (
                            <span
                              className="shrink-0 whitespace-nowrap rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800"
                              title={closureNotice}
                            >
                              {closureNotice}
                            </span>
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
                  const c = clients.find(x => x.id === m.id) ?? manualToClient(m);
                  const manualExcluded = isManualExcluded(c.id);
                  const reason = excludeReasonOf(c);
                  const excluded = reason !== null;
                  const closureNotice = filingClosureNotice(c);
                  const received = !excluded && isReceived(c.id, c.businessNo);
                  const rowNo = filteredComprehensiveGroupsOrdered.length + mi + 1;
                  return (
                    <tr
                      key={c.id}
                      data-filing-client-id={c.id}
                      className={`border-b border-slate-50 ${
                        excluded ? 'bg-slate-50/70' : received ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={received}
                          disabled
                          readOnly
                          className="h-4 w-4 accent-emerald-500 disabled:opacity-40"
                          title="홈택스 접수목록 엑셀 업로드로만 매칭됩니다 (수기 체크 불가)"
                        />
                      </td>
                      <td className="px-2 py-2 text-center text-xs tabular-nums text-slate-400">{rowNo}</td>
                      {showsReviewFeeColumn ? (
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {formatReviewFee(reviewFeeAmountForClient(c))}
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-center text-sm font-semibold text-slate-800">
                        {c.representative || c.companyName}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums text-slate-600">
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
                          {closureNotice && (
                            <span
                              className="shrink-0 whitespace-nowrap rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800"
                              title={closureNotice}
                            >
                              {closureNotice}
                            </span>
                          )}
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
        </>
        ) : (
        <>
          {canReorderTargets && (
            <p className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-400">
              업체명을 꾹 눌러 순서 변경 (담당자·세목별 전용 — 수임처 관리 기준 위에 이 세목만 덮어씀)
            </p>
          )}
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              {renderColFilter('receipt', '접수', targetColumnFilterOptions.receipt, 'w-12')}
              <th className="sticky top-0 z-20 w-12 whitespace-nowrap bg-slate-50 px-2 py-2 text-center font-semibold shadow-[0_1px_0_0_#e2e8f0]">순번</th>
              {showsReviewFeeColumn
                ? renderColFilter(
                    'fee',
                    '수수료',
                    targetColumnFilterOptions.fee,
                    'w-24',
                    undefined,
                    reviewFeeHeaderSubtitle,
                  )
                : null}
              {renderColFilter(
                'company',
                '업체명',
                targetColumnFilterOptions.company,
                'w-64',
                <>
                  {tax === 'vat' ? (
                    <>
                      <span className="text-[9px] font-medium text-slate-400">간이</span>
                      {renderExtraFilterMenu('kind', '간이·합계표', targetColumnFilterOptions.kind)}
                    </>
                  ) : null}
                  <span className="text-[9px] font-medium text-slate-400">유출</span>
                  {renderExtraFilterMenu('closure', '유출', targetColumnFilterOptions.closure)}
                </>,
              )}
              {renderColFilter('bizNo', '사업자번호', targetColumnFilterOptions.bizNo, 'w-32')}
              {tax === 'withholding' &&
                renderColFilter('filingType', '신고유형', targetColumnFilterOptions.filingType, 'w-28')}
              {vatProvisional &&
                renderColFilter('obligation', '구분', targetColumnFilterOptions.obligation, 'w-32')}
              {renderColFilter('note', '특이사항(제외사유 등)', targetColumnFilterOptions.note)}
              {renderColFilter('exclude', '제외', targetColumnFilterOptions.exclude, 'w-12')}
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-10 text-center text-slate-400">
                  {sessionLoading
                    ? '신고 기록 불러오는 중…'
                    : `${taxLabel} 신고대상 수임처가 없습니다.`}
                </td>
              </tr>
            ) : filteredTargetsForTable.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-10 text-center text-slate-400">
                  열 필터 조건에 맞는 업체가 없습니다.
                </td>
              </tr>
            ) : (
              filteredTargetsForTable.map((c, i) => {
                const manualExcluded = isManualExcluded(c.id);
                const reason = excludeReasonOf(c);
                const excluded = reason !== null;
                const closureNotice = filingClosureNotice(c);
                const semiAnnualAutoExcluded =
                  excluded &&
                  !manualExcluded &&
                  reason === SEMI_ANNUAL_OFF_MONTH_EXCLUDE_REASON;
                const autoExcluded = excluded && !manualExcluded;
                const vatObligation =
                  tax === 'vat' ? readVatObligation(c, period.vatPhase) : null;
                const vatNoticeOnly = vatObligation === '예정고지';
                const vatSummaryOnly = tax === 'vat' && isVatSummaryOnlyClient(c);
                const skipReceipt = vatNoticeOnly || vatSummaryOnly;
                const received = !excluded && !skipReceipt && isReceived(c.id, c.businessNo);
                const reorderIndex = filteredTargetsForTable
                  .slice(0, i + 1)
                  .filter(x => !isManualId(x.id)).length - 1;
                const canReorderRow = canReorderTargets && !isManualId(c.id);
                const nameCls = `min-w-0 break-words text-sm font-semibold ${
                  excluded
                    ? 'text-slate-400 line-through decoration-slate-400'
                    : 'text-slate-800'
                }`;
                return (
                  <tr
                    key={c.id}
                    data-filing-client-id={c.id}
                    className={`border-b border-slate-50 ${
                      excluded ? 'bg-slate-50/70' : received ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <td className="px-2 py-2 text-center">
                      {skipReceipt ? (
                        <span
                          className="text-xs text-slate-300"
                          title={vatSummaryOnly ? '합계표제출 대상' : '예정고지 대상'}
                        >
                          —
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={received}
                          disabled
                          readOnly
                          className="h-4 w-4 accent-emerald-500 disabled:opacity-40"
                          title="홈택스 접수목록 엑셀 업로드로만 매칭됩니다 (수기 체크 불가)"
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <FilingReorderIndexCell
                        index={canReorderRow ? reorderIndex : i}
                      />
                    </td>
                    {showsReviewFeeColumn ? (
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                        {formatReviewFee(reviewFeeAmountForClient(c))}
                      </td>
                    ) : null}
                      <td className="px-2 py-2">
                        <div
                          data-filing-reorder-id={canReorderRow ? c.id : undefined}
                          onPointerDown={e => handleTargetPointerDown(e, c.id)}
                          onPointerMove={handleTargetPointerMove}
                          onPointerUp={handleTargetPointerUp}
                          onPointerCancel={endTargetDrag}
                          onClickCapture={e => {
                            if (suppressTargetClickRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                              suppressTargetClickRef.current = false;
                            }
                          }}
                          className={`flex min-w-0 flex-wrap items-center gap-1.5 ${
                            draggingTargetId === c.id ? 'rounded-md bg-blue-50/80' : ''
                          } ${canReorderRow ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          style={canReorderRow ? { touchAction: 'none' } : undefined}
                        >
                        {isManualId(c.id) ? (
                          <span className={nameCls}>{c.companyName || '(이름 없음)'}</span>
                        ) : tax === 'withholding' ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (suppressTargetClickRef.current) return;
                              setIncomePanelClient(c);
                            }}
                            className={`min-w-0 break-words text-left text-sm font-semibold hover:underline ${
                              excluded
                                ? 'text-slate-400 line-through decoration-slate-400'
                                : 'text-slate-800 hover:text-blue-600'
                            }`}
                            title="클릭 — 신고대상 설정 · 길게 눌러 끌면 순서 변경"
                          >
                            {c.companyName || '(이름 없음)'}
                          </button>
                        ) : tax === 'corporate' ? (
                          <ReviewLinkedCompanyName
                            clientId={c.id}
                            name={c.companyName || '(이름 없음)'}
                            className={nameCls}
                            title={
                              canReorderRow
                                ? '클릭 — 검토표/상세 · 길게 눌러 순서 변경'
                                : undefined
                            }
                            shouldSuppressClick={() => suppressTargetClickRef.current}
                          />
                        ) : (
                          <ClientDetailCompanyName
                            clientId={c.id}
                            name={c.companyName || '(이름 없음)'}
                            className={nameCls}
                            title={
                              canReorderRow
                                ? '클릭 — 수임처 상세 · 길게 눌러 순서 변경'
                                : '수임처 상세'
                            }
                            shouldSuppressClick={() => suppressTargetClickRef.current}
                          />
                        )}
                        {c.representative && (
                          <span className="shrink-0 text-xs text-slate-400">{c.representative}</span>
                        )}
                        {tax === 'vat' && isVatSummaryOnlyClient(c) && (
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            합계표제출
                          </span>
                        )}
                        {tax === 'vat' && isSimplifiedVatClient(c) && (
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                            간이
                          </span>
                        )}
                        {closureNotice && (
                          <span
                            className="shrink-0 whitespace-nowrap rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800"
                            title={closureNotice}
                          >
                            {closureNotice}
                          </span>
                        )}
                        {tax === 'withholding' && (() => {
                          const n = filingCountForBiz(record.excelBizCounts, excelSet, c.businessNo);
                          if (n <= 1) return null;
                          return (
                            <span
                              className="shrink-0 whitespace-nowrap rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800"
                              title="접수목록에 같은 사업자번호 신고가 2건 이상입니다"
                            >
                              접수 {n}건
                            </span>
                          );
                        })()}
                        {tax === 'withholding' && (() => {
                          const wh = readWithholdingSettings(c.intakeData);
                          if (!wh.semiAnnualTarget) return null;
                          return (
                            <span
                              className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
                              title="반기 신고대상 (1·7월 신고만)"
                            >
                              반기
                            </span>
                          );
                        })()}
                        {isExtraAdded(c.id) && !locked && (
                          <>
                            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                              추가
                            </span>
                            <button
                              type="button"
                              onClick={() => removeExtraClient(c.id)}
                              className="shrink-0 text-xs text-slate-400 hover:text-rose-500"
                              title="추가한 업체 삭제"
                            >
                              삭제
                            </button>
                          </>
                        )}
                        {isExtraAdded(c.id) && locked && (
                          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                            추가
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-sm tabular-nums text-slate-600">{c.businessNo || '-'}</td>
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
                              const active = (
                                isExtraAdded(c.id)
                                  ? readManualFilingType(record.extraClients.find(m => m.id === c.id))
                                  : readFilingType(c.intakeData)
                              ) === opt;
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
                    {vatProvisional && (
                      <td className="px-2 py-2 text-center">
                        {isManualId(c.id) ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <div
                            className={`inline-flex rounded-lg border p-0.5 text-[11px] font-bold ${
                              locked ? 'opacity-60' : ''
                            } border-slate-200 bg-slate-50`}
                          >
                            {(['예정신고', '예정고지'] as const).map(opt => {
                              const active = readVatObligation(c, period.vatPhase) === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={locked}
                                  onClick={() => void setClientVatObligation(c, opt)}
                                  className={`rounded-md px-1.5 py-0.5 transition-colors ${
                                    active
                                      ? opt === '예정고지'
                                        ? 'bg-violet-600 text-white shadow-sm'
                                        : 'bg-blue-600 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-800'
                                  } disabled:cursor-default`}
                                >
                                  {opt === '예정신고' ? '신고' : '고지'}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-2">
                      {autoExcluded && !isForceIncluded(c.id) ? (
                        <span className="inline-block truncate text-xs font-medium text-slate-400">
                          {reason}
                          <span className="ml-1 text-slate-500">(제외 체크 해제 시 포함)</span>
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
                        disabled={locked}
                        onChange={e => toggleExclude(c.id, e.target.checked)}
                        className="h-4 w-4 accent-slate-400 disabled:opacity-40"
                        title={
                          semiAnnualAutoExcluded
                            ? '반기 자동제외 — 체크 해제하면 이번 달 신고대상에 포함됩니다'
                            : autoExcluded
                              ? reason || '자동 제외'
                              : isForceIncluded(c.id)
                                ? '수기로 다시 포함됨 — 체크하면 제외'
                                : '신고목록에서 제외'
                        }
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </>
        )}
      </div>

      {excelSet.size > 0 && (
        <FilingBottomStats
          target={targetCount}
          received={receivedCount}
          diff={diff}
          unit="곳"
          receivedFromExcel
        />
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
            const url = isMaster ? '/api/clients?includeIntake=1' : '/api/clients?mine=1&scope=filing&includeIntake=1';
            fetch(url, { cache: 'no-store' })
              .then(r => (r.ok ? r.json() : null))
              .then(d => {
                if (d?.clients) setAllClients(d.clients as ClientRecord[]);
              })
              .catch(() => {});
            incomeSectionRef.current?.reload();
          }}
        />
      )}
    </PortalPageShell>
  );
}
