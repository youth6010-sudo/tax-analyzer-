'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import {
  groupClientsByManager,
  MANAGER_DISPLAY_ORDER,
  splitManagerClientsByCategory,
  sumClientFees,
  SINGO_DAERI,
} from '@/app/utils/clientsGrouping';
import {
  applyManagerRosterDisplayOrder,
  commitClientListReorder,
  DEFAULT_ROSTER_COLUMN_WIDTH,
  MAX_ROSTER_COLUMN_WIDTH,
  MIN_ROSTER_COLUMN_WIDTH,
  readManagerClientOrder,
  readRosterColumnWidth,
  ROSTER_COLUMN_WIDTH_STORAGE_KEY,
  writeRosterColumnWidth,
} from '@/app/utils/clientListPrefs';
import { useLongPressListReorder } from '@/app/utils/useLongPressListReorder';
import { getPortalChurnRecords, subscribePortal } from '@/app/utils/portalStore';
import { clientNeedsNtsAttention } from '@/app/utils/churnMatch';
import { managerAccentBorderStyle, managerHexColor } from '@/lib/calendarManagerColors';
import { resolveClientRecordFee, readFeeItems, type FeeBreakdownSave } from '@/app/utils/feeBreakdown';
import { getManagerMatchNames } from '@/app/utils/managerMatch';
import { formatBusinessNo, formatCorporateNo, formatResidentNo } from '@/app/utils/idFormat';
import { isSimplifiedVatClient, isTaxExemptClient } from '@/app/utils/filingCheck';
import { useClientRowExpand } from '@/app/components/clients/useClientRowExpand';
import ClientRowHeading, { type ClientRowBadge } from '@/app/components/clients/ClientRowHeading';
import ClientFeeCell from '@/app/components/clients/ClientFeeCell';
import ClientRowExpandPanel from '@/app/components/clients/ClientRowExpandPanel';

const COLUMN_GAP = 10;

function formatFee(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!text) return null;
  const q = query?.trim();
  if (!q) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-amber-100 text-slate-900 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

function dash(value: string): string {
  return value.trim() || '—';
}

function panelIdLabel(variant: 'personal' | 'corporate'): string {
  return variant === 'corporate' ? CLIENT_FIELD_LABELS.corporateNo : CLIENT_FIELD_LABELS.residentNo;
}

function panelIdValue(c: ClientRecord, variant: 'personal' | 'corporate'): string {
  if (variant === 'corporate') {
    const v = formatCorporateNo(c.corporateNo);
    return v.replace(/\D/g, '').length >= 10 ? v : '—';
  }
  const v = formatResidentNo(c.residentNo);
  return v.replace(/\D/g, '').length >= 10 ? v : '—';
}

function contactDisplay(c: ClientRecord): string {
  const mobile = c.mobilePhone?.trim();
  const phone = c.phone?.trim();
  if (mobile && phone) return `${mobile} · ${phone}`;
  return mobile || phone || '—';
}

const ROW_GRID_FEE = 'grid grid-cols-[2rem_minmax(0,1fr)_4.25rem] gap-x-1.5 items-start';
const ROW_GRID_NO_FEE = 'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1.5 items-start';

function CellValue({
  value,
  mono,
  query,
}: {
  value: string;
  mono?: boolean;
  query?: string;
}) {
  return (
    <span
      className={[
        'truncate text-xs leading-snug text-slate-800',
        mono ? 'portal-data' : 'font-medium',
      ].join(' ')}
      title={value}
    >
      {value === '—' ? <span className="text-slate-400">—</span> : query ? <Highlight text={value} query={query} /> : value}
    </span>
  );
}

const PANEL = {
  // 개인 = 초록(emerald)
  personal: {
    accent: 'border-l-emerald-300',
    headerBg: 'bg-emerald-50/80',
    headerText: 'text-emerald-800',
    badge: 'bg-emerald-100/90 text-emerald-800',
    footer: 'bg-emerald-50/60 border-emerald-100/80 text-emerald-900',
    dot: 'bg-emerald-400',
  },
  // 법인 = 하늘/파랑(sky)
  corporate: {
    accent: 'border-l-sky-300',
    headerBg: 'bg-sky-50/80',
    headerText: 'text-sky-800',
    badge: 'bg-sky-100/90 text-sky-800',
    footer: 'bg-sky-50/60 border-sky-100/80 text-sky-900',
    dot: 'bg-sky-400',
  },
  other: {
    accent: 'border-l-amber-300',
    headerBg: 'bg-amber-50/80',
    headerText: 'text-amber-900',
    badge: 'bg-amber-100/90 text-amber-900',
    footer: 'bg-amber-50/60 border-amber-100/80 text-amber-950',
    dot: 'bg-amber-400',
  },
  // 신고대리 = 보라(violet)
  singo: {
    accent: 'border-l-violet-300',
    headerBg: 'bg-violet-50/80',
    headerText: 'text-violet-800',
    badge: 'bg-violet-100/90 text-violet-800',
    footer: 'bg-violet-50/70 border-violet-100/80 text-violet-900',
    dot: 'bg-violet-400',
  },
} as const;

function RosterColumnHeader({ showFee }: { showFee: boolean }) {
  return (
    <div
      className={[
        showFee ? ROW_GRID_FEE : ROW_GRID_NO_FEE,
        'sticky top-0 z-10 px-2 py-1 text-[11px] font-semibold text-slate-600',
        'bg-slate-50/95 backdrop-blur-sm border-b border-slate-200',
      ].join(' ')}
    >
      <span className="text-center">#</span>
      <span>{CLIENT_FIELD_LABELS.companyName}</span>
      {showFee && <span className="text-right">{CLIENT_FIELD_LABELS.fee}</span>}
    </div>
  );
}

function ClientRosterRow({
  client: c,
  index,
  variant,
  panelCategory,
  showFee,
  feeEditable = true,
  feeVisible = true,
  query,
  returnTo,
  onFeeChange,
  feeRefreshKey,
  corpRevenueThisYear,
  reorderProps,
  consumeReorderClick,
  showNtsClosed,
}: {
  client: ClientRecord;
  index: number;
  variant: 'personal' | 'corporate';
  panelCategory?: string;
  showFee: boolean;
  feeEditable?: boolean;
  feeVisible?: boolean;
  query: string;
  returnTo: string;
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKey?: number;
  corpRevenueThisYear?: number | null;
  reorderProps?: React.HTMLAttributes<HTMLButtonElement>;
  consumeReorderClick?: () => boolean;
  showNtsClosed?: boolean;
}) {
  const isChurned = c.status === 'churned';
  const rep = dash(c.representative);
  const biz = dash(formatBusinessNo(c.businessNo));
  const idVal = panelIdValue(c, variant);
  const contact = contactDisplay(c);
  const idLabel = panelIdLabel(variant);
  const badges: ClientRowBadge[] = [];
  if (panelCategory === SINGO_DAERI && c.businessEntityType === 'nonBusiness') {
    badges.push({ label: '비사업자', tone: 'amber' });
  }
  if (isSimplifiedVatClient(c)) {
    badges.push({ label: '간이', tone: 'sky' });
  } else if (isTaxExemptClient(c)) {
    badges.push({ label: '면세', tone: 'violet' });
  }
  const ntsClosed = showNtsClosed ?? false;
  const ntsClosedLabel = c.nts?.statusCode === '02' ? '휴업' : c.nts?.statusCode === '03' ? '폐업' : '폐업/휴업';
  const rowGrid = showFee ? ROW_GRID_FEE : ROW_GRID_NO_FEE;
  const { expanded, onNameClick, goToDetail, prefetchDetail, nameButtonClass } = useClientRowExpand(
    c.id,
    returnTo,
  );

  return (
    <li
      className={[
        rowGrid,
        'px-2 py-1 border-b border-slate-100 last:border-b-0',
        expanded ? 'bg-blue-50/40' : index % 2 === 1 ? 'bg-slate-50/70' : 'bg-white',
        isChurned ? 'opacity-45' : '',
      ].join(' ')}
    >
      <span className="text-[11px] font-medium text-slate-500 tabular-nums leading-none self-start pt-px">
        {index + 1}
      </span>

      <div className="min-w-0 overflow-hidden">
        <ClientRowHeading
          companyName={<Highlight text={c.companyName} query={query} />}
          companyTitle={c.companyName}
          expanded={expanded}
          isChurned={isChurned}
          badges={badges}
          ntsClosed={ntsClosed}
          ntsClosedLabel={ntsClosedLabel}
          onNameClick={onNameClick}
          onPrefetch={prefetchDetail}
          nameButtonClass={nameButtonClass}
          reorderProps={reorderProps}
          consumeReorderClick={consumeReorderClick}
        />
      </div>

      {showFee && (
        <ClientFeeCell
          clientId={c.id}
          value={resolveClientRecordFee(c)}
          intakeData={c.intakeData}
          corpRevenueThisYear={corpRevenueThisYear}
          onSave={onFeeChange}
          readOnly={!feeEditable}
          hidden={!feeVisible}
          className="pt-px"
        />
      )}

      {expanded && (
        <div className={showFee ? 'col-span-3 col-start-1 min-w-0' : 'col-span-2 col-start-1 min-w-0'}>
          <ClientRowExpandPanel
            clientId={c.id}
            feeRefreshKey={feeRefreshKey}
            onDetailClick={goToDetail}
            onPrefetch={prefetchDetail}
            feeItems={showFee && feeVisible ? readFeeItems(c.intakeData) : undefined}
            showFeeHistory={showFee && feeVisible}
            fields={[
              { label: CLIENT_FIELD_LABELS.representative, value: <CellValue value={rep} query={query} /> },
              { label: CLIENT_FIELD_LABELS.businessNo, value: <CellValue value={biz} mono query={query} /> },
              { label: idLabel, value: <CellValue value={idVal} mono query={query} /> },
              { label: CLIENT_FIELD_LABELS.phone, value: <CellValue value={contact} query={query} /> },
            ]}
          />
        </div>
      )}
    </li>
  );
}

function EntityPanel({
  title,
  variant,
  clients,
  query,
  returnTo,
  onFeeChange,
  feeRefreshKeys,
  corpRevenueByClientId,
  feeEditable = true,
  feeVisible = true,
  showFooter = false,
  manager,
  allManagerClients,
  sort,
  onClientOrderChange,
}: {
  title: string;
  variant: 'personal' | 'corporate' | 'other';
  clients: ClientRecord[];
  query: string;
  returnTo: string;
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKeys?: Record<string, number>;
  corpRevenueByClientId?: Record<string, number | null>;
  feeEditable?: boolean;
  feeVisible?: boolean;
  showFooter?: boolean;
  manager: string;
  allManagerClients: ClientRecord[];
  sort: 'name' | 'code';
  onClientOrderChange?: () => void;
}) {
  const feeSum = sumClientFees(clients);
  const s = variant === 'other' && title === SINGO_DAERI ? PANEL.singo : PANEL[variant];
  const showFee = variant !== 'other';
  const rowVariant = (c: ClientRecord): 'personal' | 'corporate' =>
    c.businessEntityType === 'corporate' ? 'corporate' : 'personal';

  const ids = useMemo(() => clients.map(c => c.id), [clients]);
  const handleCommit = useCallback(
    (nextIds: string[]) => {
      commitClientListReorder(manager, nextIds, allManagerClients, sort);
      onClientOrderChange?.();
    },
    [manager, allManagerClients, sort, onClientOrderChange],
  );
  const { orderedIds, getItemProps, consumeClick } = useLongPressListReorder(ids, handleCommit);
  const [churnRecords, setChurnRecords] = useState(() => getPortalChurnRecords());
  useEffect(() => subscribePortal(() => setChurnRecords(getPortalChurnRecords())), []);
  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const displayClients = orderedIds
    .map(id => byId.get(id))
    .filter((c): c is ClientRecord => !!c);

  const panelHeight =
    variant === 'other'
      ? 'h-[min(180px,22vh)] min-h-[110px]'
      : 'h-[min(220px,26vh)] min-h-[130px]';

  return (
    <div
      className={[
        'flex flex-col min-h-0 min-w-0',
        panelHeight,
        'rounded-xl border border-slate-200 bg-white overflow-hidden',
        'shadow-sm border-l-[3px]',
        s.accent,
      ].join(' ')}
    >
      <div className={`shrink-0 flex items-center justify-between gap-1.5 px-2 py-1.5 border-b border-gray-100 ${s.headerBg}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} aria-hidden />
          <h3 className={`text-xs font-bold truncate ${s.headerText}`}>{title}</h3>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold tabular-nums ${s.badge}`}>
          {clients.length}건
        </span>
      </div>

      <div
        className="roster-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain"
        data-roster-panel-scroll
      >
        {clients.length === 0 ? (
          <p className="px-2 py-3 text-xs text-slate-400">수임처 없음</p>
        ) : (
          <div className="w-full min-w-0">
            <RosterColumnHeader showFee={showFee} />
            <ul>
              {displayClients.map((c, i) => (
                <ClientRosterRow
                  key={c.id}
                  client={c}
                  index={i}
                  variant={variant === 'other' ? rowVariant(c) : variant}
                  panelCategory={variant === 'other' ? title : undefined}
                  showFee={showFee}
                  feeEditable={feeEditable}
                  feeVisible={feeVisible}
                  query={query}
                  returnTo={returnTo}
                  onFeeChange={onFeeChange}
                  feeRefreshKey={feeRefreshKeys?.[c.id]}
                  corpRevenueThisYear={corpRevenueByClientId?.[c.id]}
                  reorderProps={getItemProps(c.id)}
                  consumeReorderClick={consumeClick}
                  showNtsClosed={clientNeedsNtsAttention(c, churnRecords)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {showFooter && (
        <div className={`shrink-0 flex items-center justify-between gap-1.5 px-2 py-1.5 border-t text-xs ${s.footer}`}>
          <span className="font-medium opacity-80">{title} 합계</span>
          <span className="tabular-nums font-semibold whitespace-nowrap">
            {clients.length}건
            {feeVisible ? ` · ${formatFee(feeSum)}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function MainCategorySummary({
  personal,
  corporate,
  feeVisible = true,
}: {
  personal: ClientRecord[];
  corporate: ClientRecord[];
  feeVisible?: boolean;
}) {
  const personalFee = sumClientFees(personal);
  const corporateFee = sumClientFees(corporate);
  const mainCount = personal.length + corporate.length;
  const mainFee = personalFee + corporateFee;
  const feeSuffix = (n: number | null) => (feeVisible ? ` · ${formatFee(n)}` : '');

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium tabular-nums text-sky-800 ring-1 ring-sky-100">
          법인 {corporate.length}
          {feeSuffix(corporateFee)}
        </span>
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium tabular-nums text-emerald-800 ring-1 ring-emerald-100">
          개인 {personal.length}
          {feeSuffix(personalFee)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1.5 text-xs text-slate-700 border-t border-slate-200/80 pt-1.5">
        <span className="font-semibold">개인·법인 합계</span>
        <span className="tabular-nums font-bold text-slate-900 whitespace-nowrap">
          {mainCount}건
          {feeSuffix(mainFee)}
        </span>
      </div>
    </div>
  );
}

function ManagerSection({
  manager,
  clients,
  query,
  returnTo,
  isSelf,
  feeEditable = true,
  feeVisible = true,
  visibleOptionalCategories,
  onFeeChange,
  feeRefreshKeys,
  corpRevenueByClientId,
  sort,
  onClientOrderChange,
}: {
  manager: string;
  clients: ClientRecord[];
  query: string;
  returnTo: string;
  isSelf?: boolean;
  feeEditable?: boolean;
  feeVisible?: boolean;
  visibleOptionalCategories: string[];
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKeys?: Record<string, number>;
  corpRevenueByClientId?: Record<string, number | null>;
  sort: 'name' | 'code';
  onClientOrderChange?: () => void;
}) {
  const realName = STAFF_REAL_NAMES[manager];
  const { personal, corporate, otherCategories } = splitManagerClientsByCategory(clients);
  const visibleOptional = otherCategories.filter(({ category }) =>
    visibleOptionalCategories.includes(category),
  );
  return (
    <section
      className={[
        'flex flex-col w-full rounded-xl bg-white border border-slate-200 shadow-sm border-l-[3px]',
        isSelf ? 'ring-1 ring-blue-200' : '',
      ].join(' ')}
      style={managerAccentBorderStyle(manager)}
    >
      <div className="px-2.5 py-1.5 border-b border-slate-100 bg-white">
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
            style={{ backgroundColor: managerHexColor(manager) }}
            aria-hidden
          >
            {manager.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <h2 className="text-sm font-semibold text-slate-900">{manager}</h2>
              {isSelf && (
                <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50">
                  나
                </span>
              )}
              {realName && realName !== manager && (
                <span className="text-xs text-slate-400">{realName}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 shrink-0">
            <span className="rounded bg-sky-50 px-1.5 py-px text-[10px] font-medium tabular-nums text-sky-800">
              법인 {corporate.length}
            </span>
            <span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] font-medium tabular-nums text-emerald-800">
              개인 {personal.length}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 p-1.5">
        <EntityPanel
          title="법인"
          variant="corporate"
          clients={corporate}
          query={query}
          returnTo={returnTo}
          onFeeChange={onFeeChange}
          feeRefreshKeys={feeRefreshKeys}
          corpRevenueByClientId={corpRevenueByClientId}
          feeEditable={feeEditable}
          feeVisible={feeVisible}
          manager={manager}
          allManagerClients={clients}
          sort={sort}
          onClientOrderChange={onClientOrderChange}
        />
        <EntityPanel
          title="개인"
          variant="personal"
          clients={personal}
          query={query}
          returnTo={returnTo}
          onFeeChange={onFeeChange}
          feeRefreshKeys={feeRefreshKeys}
          corpRevenueByClientId={corpRevenueByClientId}
          feeEditable={feeEditable}
          feeVisible={feeVisible}
          manager={manager}
          allManagerClients={clients}
          sort={sort}
          onClientOrderChange={onClientOrderChange}
        />
        <MainCategorySummary personal={personal} corporate={corporate} feeVisible={feeVisible} />
        {visibleOptional.map(({ category, clients: catClients }) => (
          <EntityPanel
            key={category}
            title={category}
            variant="other"
            clients={catClients}
            query={query}
            returnTo={returnTo}
            onFeeChange={onFeeChange}
            feeRefreshKeys={feeRefreshKeys}
            corpRevenueByClientId={corpRevenueByClientId}
            feeEditable={feeEditable}
            feeVisible={feeVisible}
            manager={manager}
            allManagerClients={clients}
            sort={sort}
            onClientOrderChange={onClientOrderChange}
          />
        ))}
      </div>
    </section>
  );
}

function ScrollButton({
  direction,
  onClick,
  label,
  className = '',
}: {
  direction: 'left' | 'right';
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        'bg-white/95 border border-slate-200 shadow-md shadow-slate-300/30',
        'text-slate-700 hover:text-slate-900 hover:bg-white hover:border-slate-300',
        'active:scale-95 transition-all',
        className,
      ].join(' ')}
    >
      <span className="text-lg leading-none font-semibold" aria-hidden>
        {direction === 'left' ? '‹' : '›'}
      </span>
    </button>
  );
}

function ManagerQuickNav({
  managers,
  activeIndex,
  currentUserName,
  onSelect,
}: {
  managers: string[];
  activeIndex: number;
  currentUserName?: string | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-1 overflow-x-auto roster-scroll bg-[var(--background)]/95 backdrop-blur-sm py-2 px-1 border-b border-slate-200/80">
      {managers.map((mgr, i) => {
        const active = i === activeIndex;
        const isSelf = currentUserName === mgr;
        return (
          <button
            key={mgr}
            type="button"
            onClick={() => onSelect(i)}
            className={[
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors',
              active
                ? isSelf
                  ? 'border-blue-400 bg-blue-50 text-blue-900 shadow-sm'
                  : 'border-slate-300 bg-white text-slate-900 shadow-sm'
                : 'border-transparent bg-slate-100/80 text-slate-600 hover:bg-slate-100 hover:text-slate-800',
            ].join(' ')}
          >
            {mgr}
            {isSelf && <span className="ml-1 text-[9px] font-bold text-blue-600">나</span>}
          </button>
        );
      })}
    </div>
  );
}

function canPanelScrollInDirection(el: HTMLElement, deltaY: number): boolean {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) return false;
  if (deltaY > 0) return el.scrollTop < max - 1;
  if (deltaY < 0) return el.scrollTop > 0;
  return false;
}

function HorizontalRosterStrip({
  managers,
  currentUserName,
  fitAllColumns = false,
  columnWidth,
  children,
}: {
  managers: string[];
  currentUserName?: string | null;
  fitAllColumns?: boolean;
  columnWidth: number;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const useHorizontalScroll = !fitAllColumns;
  const columnStride = columnWidth + COLUMN_GAP;

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el || !useHorizontalScroll) return;
    const clamped = Math.max(0, Math.min(index, managers.length - 1));
    el.scrollTo({
      left: clamped * columnStride,
      behavior: 'smooth',
    });
    setActiveIndex(clamped);
  }, [columnStride, managers.length, useHorizontalScroll]);

  const scrollByColumn = useCallback((direction: -1 | 1) => {
    scrollToIndex(activeIndex + direction);
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !useHorizontalScroll) return;

    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / columnStride);
      setActiveIndex(Math.max(0, Math.min(idx, managers.length - 1)));
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      let node = e.target as HTMLElement | null;
      while (node) {
        if (node.hasAttribute('data-roster-panel-scroll')) {
          if (canPanelScrollInDirection(node, e.deltaY)) return;
          break;
        }
        node = node.parentElement;
      }

      if (!e.shiftKey) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollByColumn(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollByColumn(1);
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [columnStride, managers.length, scrollByColumn, useHorizontalScroll]);

  return (
    <div>
      {managers.length > 1 && (
        <ManagerQuickNav
          managers={managers}
          activeIndex={activeIndex}
          currentUserName={currentUserName}
          onSelect={scrollToIndex}
        />
      )}
      <div className="relative">
        {managers.length > 1 && useHorizontalScroll && (
          <>
            <ScrollButton
              direction="left"
              label="이전 담당자"
              onClick={() => scrollByColumn(-1)}
              className="absolute left-0 top-1/2 z-20 -translate-y-1/2 -translate-x-1/2"
            />
            <ScrollButton
              direction="right"
              label="다음 담당자"
              onClick={() => scrollByColumn(1)}
              className="absolute right-0 top-1/2 z-20 -translate-y-1/2 translate-x-1/2"
            />
          </>
        )}
        <div
          ref={scrollRef}
          className={
            fitAllColumns
              ? 'grid grid-cols-1 gap-2.5 min-w-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 overflow-x-auto'
              : 'roster-h-scroll roster-scroll min-w-0 overflow-x-auto overflow-y-visible snap-x snap-proximity scroll-px-3 pb-2'
          }
        >
          <div
            className={
              fitAllColumns
                ? 'contents'
                : 'flex items-start gap-2.5 w-max py-0.5'
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function RosterColumnResizeHandle({
  columnWidth,
  onResize,
}: {
  columnWidth: number;
  onResize: (width: number) => void;
}) {
  const startX = useRef(0);
  const startW = useRef(columnWidth);
  const liveW = useRef(columnWidth);

  useEffect(() => {
    liveW.current = columnWidth;
  }, [columnWidth]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    startX.current = e.clientX;
    startW.current = liveW.current;
    target.setPointerCapture(e.pointerId);

    const clamp = (n: number) =>
      Math.min(MAX_ROSTER_COLUMN_WIDTH, Math.max(MIN_ROSTER_COLUMN_WIDTH, Math.round(n)));

    const onMove = (ev: PointerEvent) => {
      const next = clamp(startW.current + (ev.clientX - startX.current));
      liveW.current = next;
      onResize(next);
    };
    const onUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      writeRosterColumnWidth(liveW.current);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  return (
    <button
      type="button"
      aria-label="담당자 목록 가로 너비 조절"
      title="드래그하여 목록 가로 너비 조절 (모든 담당자에 적용)"
      onPointerDown={onPointerDown}
      className="absolute right-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none border-0 bg-transparent p-0 hover:bg-blue-400/25 active:bg-blue-500/35"
    />
  );
}

/** 담당자 가로 배치 · 개인/법인 세로 · 체크한 담당자만 */
export default function ManagerRosterGrid({
  clients,
  sort,
  query,
  returnTo,
  visibleManagers,
  visibleOptionalCategories,
  currentUserName,
  isAdmin = false,
  onFeeChange,
  feeRefreshKeys,
  corpRevenueByClientId,
  orderVersion = 0,
  onClientOrderChange,
}: {
  clients: ClientRecord[];
  sort: 'name' | 'code';
  query: string;
  returnTo: string;
  visibleManagers: string[];
  visibleOptionalCategories: string[];
  currentUserName?: string | null;
  isAdmin?: boolean;
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKeys?: Record<string, number>;
  corpRevenueByClientId?: Record<string, number | null>;
  orderVersion?: number;
  onClientOrderChange?: () => void;
}) {
  const [columnWidth, setColumnWidth] = useState(DEFAULT_ROSTER_COLUMN_WIDTH);

  useEffect(() => {
    setColumnWidth(readRosterColumnWidth());
    const sync = () => setColumnWidth(readRosterColumnWidth());
    window.addEventListener(`local-storage:${ROSTER_COLUMN_WIDTH_STORAGE_KEY}`, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(`local-storage:${ROSTER_COLUMN_WIDTH_STORAGE_KEY}`, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // visibleManagers는 호출부에서 사용자가 지정한 순서대로 전달된다 → 그 순서를 그대로 유지
  const managerGroups = useMemo(() => {
    const grouped = groupClientsByManager(clients, sort);
    const byManager = new Map(grouped.map(g => [g.manager, g.clients]));

    return visibleManagers.map(manager => ({
      manager,
      clients: applyManagerRosterDisplayOrder(
        byManager.get(manager) ?? [],
        sort,
        readManagerClientOrder(manager),
      ),
    }));
  }, [clients, sort, visibleManagers, orderVersion]);

  // 수수료 수정 권한: 관리자는 전체, 그 외는 본인 담당만
  const myManagerNames = useMemo(
    () => new Set(currentUserName ? getManagerMatchNames(currentUserName) : []),
    [currentUserName],
  );

  if (visibleManagers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-600">표시할 담당자를 선택해 주세요</p>
        <p className="portal-meta mt-1 text-xs">필터에서 담당자를 선택하세요</p>
      </div>
    );
  }

  const fitAllColumns = visibleManagers.length <= 5 && columnWidth <= DEFAULT_ROSTER_COLUMN_WIDTH;

  return (
    <HorizontalRosterStrip
      managers={managerGroups.map(g => g.manager)}
      currentUserName={currentUserName}
      fitAllColumns={fitAllColumns}
      columnWidth={columnWidth}
    >
      {managerGroups.map(mgr => (
        <div
          key={mgr.manager}
          className={[
            'relative flex flex-col min-w-0',
            fitAllColumns ? 'w-full' : 'snap-start shrink-0',
          ].join(' ')}
          style={
            fitAllColumns
              ? { minWidth: columnWidth }
              : { width: columnWidth, minWidth: columnWidth }
          }
        >
          <ManagerSection
            manager={mgr.manager}
            clients={mgr.clients}
            query={query}
            returnTo={returnTo}
            isSelf={Boolean(currentUserName && mgr.manager === currentUserName)}
            feeEditable={isAdmin || myManagerNames.has(mgr.manager)}
            feeVisible={isAdmin || myManagerNames.has(mgr.manager)}
            visibleOptionalCategories={visibleOptionalCategories}
            onFeeChange={onFeeChange}
            feeRefreshKeys={feeRefreshKeys}
            corpRevenueByClientId={corpRevenueByClientId}
            sort={sort}
            onClientOrderChange={onClientOrderChange}
          />
          <RosterColumnResizeHandle columnWidth={columnWidth} onResize={setColumnWidth} />
        </div>
      ))}
    </HorizontalRosterStrip>
  );
}

export { MANAGER_DISPLAY_ORDER };
