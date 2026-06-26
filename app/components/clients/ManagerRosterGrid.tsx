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
import { resolveClientRecordFee, readFeeBreakdown, type FeeBreakdownSave } from '@/app/utils/feeBreakdown';
import { formatBusinessNo, formatCorporateNo, formatResidentNo } from '@/app/utils/idFormat';
import { useClientRowExpand } from '@/app/components/clients/useClientRowExpand';
import ClientRowHeading from '@/app/components/clients/ClientRowHeading';
import ClientFeeCell from '@/app/components/clients/ClientFeeCell';
import ClientRowExpandPanel from '@/app/components/clients/ClientRowExpandPanel';

const COLUMN_WIDTH = 520;
const COLUMN_GAP = 16;

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

const ROW_GRID_FEE = 'grid grid-cols-[1.75rem_minmax(0,1fr)_6.5rem] gap-x-2.5 items-start';
const ROW_GRID_NO_FEE = 'grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2.5 items-start';

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
        'truncate text-base leading-snug text-slate-800',
        mono ? 'portal-data' : 'font-medium',
      ].join(' ')}
      title={value}
    >
      {value === '—' ? <span className="text-slate-400">—</span> : query ? <Highlight text={value} query={query} /> : value}
    </span>
  );
}

const PANEL = {
  personal: {
    accent: 'border-l-sky-300',
    headerBg: 'bg-sky-50/80',
    headerText: 'text-sky-800',
    badge: 'bg-sky-100/90 text-sky-800',
    footer: 'bg-sky-50/60 border-sky-100/80 text-sky-900',
    dot: 'bg-sky-400',
  },
  corporate: {
    accent: 'border-l-violet-300',
    headerBg: 'bg-violet-50/80',
    headerText: 'text-violet-800',
    badge: 'bg-violet-100/90 text-violet-800',
    footer: 'bg-violet-50/70 border-violet-100/80 text-violet-900',
    dot: 'bg-violet-400',
  },
  other: {
    accent: 'border-l-amber-300',
    headerBg: 'bg-amber-50/80',
    headerText: 'text-amber-900',
    badge: 'bg-amber-100/90 text-amber-900',
    footer: 'bg-amber-50/60 border-amber-100/80 text-amber-950',
    dot: 'bg-amber-400',
  },
} as const;

function RosterColumnHeader({ showFee }: { showFee: boolean }) {
  return (
    <div
      className={[
        showFee ? ROW_GRID_FEE : ROW_GRID_NO_FEE,
        'sticky top-0 z-10 px-3 py-2.5 text-sm font-semibold text-slate-600',
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
  query,
  returnTo,
  onFeeChange,
  feeRefreshKey,
}: {
  client: ClientRecord;
  index: number;
  variant: 'personal' | 'corporate';
  panelCategory?: string;
  showFee: boolean;
  query: string;
  returnTo: string;
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKey?: number;
}) {
  const isChurned = c.status === 'churned';
  const rep = dash(c.representative);
  const biz = dash(formatBusinessNo(c.businessNo));
  const idVal = panelIdValue(c, variant);
  const contact = contactDisplay(c);
  const idLabel = panelIdLabel(variant);
  const entityBadge =
    panelCategory === SINGO_DAERI && c.businessEntityType === 'nonBusiness' ? '비사업자' : undefined;
  const rowGrid = showFee ? ROW_GRID_FEE : ROW_GRID_NO_FEE;
  const { expanded, onNameClick, goToDetail, prefetchDetail, nameButtonClass } = useClientRowExpand(
    c.id,
    returnTo,
  );

  return (
    <li
      className={[
        rowGrid,
        'px-3 py-2.5 border-b border-slate-100 last:border-b-0',
        expanded ? 'bg-blue-50/40' : index % 2 === 1 ? 'bg-slate-50/70' : 'bg-white',
        isChurned ? 'opacity-45' : '',
      ].join(' ')}
    >
      <span className="text-sm font-medium text-slate-500 tabular-nums text-center pt-0.5">{index + 1}</span>

      <div className="min-w-0">
        <ClientRowHeading
          companyName={<Highlight text={c.companyName} query={query} />}
          companyTitle={c.companyName}
          expanded={expanded}
          isChurned={isChurned}
          entityBadge={entityBadge}
          onNameClick={onNameClick}
          onPrefetch={prefetchDetail}
          nameButtonClass={nameButtonClass}
        />
      </div>

      {showFee && (
        <ClientFeeCell
          clientId={c.id}
          value={resolveClientRecordFee(c)}
          intakeData={c.intakeData}
          onSave={onFeeChange}
          className="pt-0.5"
        />
      )}

      {expanded && (
        <div className={showFee ? 'col-span-3 col-start-1 min-w-0' : 'col-span-2 col-start-1 min-w-0'}>
          <ClientRowExpandPanel
            clientId={c.id}
            feeRefreshKey={feeRefreshKey}
            onDetailClick={goToDetail}
            onPrefetch={prefetchDetail}
            feeBreakdown={showFee ? readFeeBreakdown(c.intakeData) : undefined}
            showFeeHistory={showFee}
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

const MANAGER_ACCENT: Record<string, string> = {
  블루: 'border-l-sky-400',
  다야: 'border-l-rose-400',
  윈터: 'border-l-cyan-400',
  리아: 'border-l-fuchsia-400',
  페리: 'border-l-amber-400',
  인디: 'border-l-emerald-400',
  찰리: 'border-l-indigo-400',
};

const DEFAULT_ACCENT = 'border-l-slate-300';

function EntityPanel({
  title,
  variant,
  clients,
  query,
  returnTo,
  onFeeChange,
  feeRefreshKeys,
  showFooter = false,
}: {
  title: string;
  variant: 'personal' | 'corporate' | 'other';
  clients: ClientRecord[];
  query: string;
  returnTo: string;
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKeys?: Record<string, number>;
  showFooter?: boolean;
}) {
  const feeSum = sumClientFees(clients);
  const s = PANEL[variant];
  const showFee = variant !== 'other';
  const rowVariant = (c: ClientRecord): 'personal' | 'corporate' =>
    c.businessEntityType === 'corporate' ? 'corporate' : 'personal';

  const panelHeight =
    variant === 'other'
      ? 'h-[min(280px,32vh)] min-h-[160px]'
      : 'h-[min(380px,42vh)] min-h-[220px]';

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
      <div className={`shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100 ${s.headerBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.dot}`} aria-hidden />
          <h3 className={`text-base font-bold truncate ${s.headerText}`}>{title}</h3>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${s.badge}`}>
          {clients.length}건
        </span>
      </div>

      <div
        className="roster-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain"
        data-roster-panel-scroll
      >
        {clients.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-400">수임처 없음</p>
        ) : (
          <div className="w-full min-w-0">
            <RosterColumnHeader showFee={showFee} />
            <ul>
              {clients.map((c, i) => (
                <ClientRosterRow
                  key={c.id}
                  client={c}
                  index={i}
                  variant={variant === 'other' ? rowVariant(c) : variant}
                  panelCategory={variant === 'other' ? title : undefined}
                  showFee={showFee}
                  query={query}
                  returnTo={returnTo}
                  onFeeChange={onFeeChange}
                  feeRefreshKey={feeRefreshKeys?.[c.id]}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {showFooter && (
        <div className={`shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-t text-base ${s.footer}`}>
          <span className="font-medium opacity-80">{title} 합계</span>
          <span className="tabular-nums font-semibold whitespace-nowrap">
            {clients.length}건 · {formatFee(feeSum)}
          </span>
        </div>
      )}
    </div>
  );
}

function MainCategorySummary({
  personal,
  corporate,
}: {
  personal: ClientRecord[];
  corporate: ClientRecord[];
}) {
  const personalFee = sumClientFees(personal);
  const corporateFee = sumClientFees(corporate);
  const mainCount = personal.length + corporate.length;
  const mainFee = personalFee + corporateFee;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-md bg-violet-50 px-2.5 py-1 font-medium tabular-nums text-violet-800 ring-1 ring-violet-100">
          법인 {corporate.length} · {formatFee(corporateFee)}
        </span>
        <span className="rounded-md bg-sky-50 px-2.5 py-1 font-medium tabular-nums text-sky-800 ring-1 ring-sky-100">
          개인 {personal.length} · {formatFee(personalFee)}
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-base text-slate-700 border-t border-slate-200/80 pt-2.5">
        <span className="font-semibold">개인·법인 합계</span>
        <span className="tabular-nums font-bold text-slate-900 whitespace-nowrap">
          {mainCount}건 · {formatFee(mainFee)}
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
  visibleOptionalCategories,
  onFeeChange,
  feeRefreshKeys,
}: {
  manager: string;
  clients: ClientRecord[];
  query: string;
  returnTo: string;
  isSelf?: boolean;
  visibleOptionalCategories: string[];
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKeys?: Record<string, number>;
}) {
  const realName = STAFF_REAL_NAMES[manager];
  const { personal, corporate, otherCategories } = splitManagerClientsByCategory(clients);
  const visibleOptional = otherCategories.filter(({ category }) =>
    visibleOptionalCategories.includes(category),
  );
  const accent = MANAGER_ACCENT[manager] ?? DEFAULT_ACCENT;

  return (
    <section
      className={[
        'flex flex-col w-full rounded-xl bg-white border border-slate-200 shadow-sm border-l-[3px]',
        accent,
        isSelf ? 'ring-1 ring-blue-200' : '',
      ].join(' ')}
    >
      <div className="px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base font-semibold text-slate-600"
            aria-hidden
          >
            {manager.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-lg font-semibold text-slate-900">{manager}</h2>
              {isSelf && (
                <span className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50">
                  나
                </span>
              )}
              {realName && realName !== manager && (
                <span className="text-base text-slate-400">{realName}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <span className="rounded-md bg-violet-50 px-2 py-0.5 text-sm font-medium tabular-nums text-violet-800">
              법인 {corporate.length}
            </span>
            <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sm font-medium tabular-nums text-sky-800">
              개인 {personal.length}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2">
        <EntityPanel
          title="법인"
          variant="corporate"
          clients={corporate}
          query={query}
          returnTo={returnTo}
          onFeeChange={onFeeChange}
          feeRefreshKeys={feeRefreshKeys}
        />
        <EntityPanel
          title="개인"
          variant="personal"
          clients={personal}
          query={query}
          returnTo={returnTo}
          onFeeChange={onFeeChange}
          feeRefreshKeys={feeRefreshKeys}
        />
        <MainCategorySummary personal={personal} corporate={corporate} />
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
}: {
  direction: 'left' | 'right';
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'sticky top-32 z-20 self-center',
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        'bg-white border border-slate-200 shadow-lg shadow-slate-300/40',
        'text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300',
        'active:scale-95 transition-all',
      ].join(' ')}
    >
      <span className="text-xl leading-none font-semibold" aria-hidden>
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
    <div className="sticky top-0 z-30 -mx-1 mb-3 flex items-center gap-1 overflow-x-auto roster-scroll bg-[var(--background)]/95 backdrop-blur-sm py-2 px-1 border-b border-slate-200/80">
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
  children,
}: {
  managers: string[];
  currentUserName?: string | null;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(index, managers.length - 1));
    el.scrollTo({
      left: clamped * (COLUMN_WIDTH + COLUMN_GAP),
      behavior: 'smooth',
    });
    setActiveIndex(clamped);
  }, [managers.length]);

  const scrollByColumn = useCallback((direction: -1 | 1) => {
    scrollToIndex(activeIndex + direction);
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / (COLUMN_WIDTH + COLUMN_GAP));
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
  }, [managers.length, scrollByColumn]);

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
      <div className="flex items-start gap-1">
        {managers.length > 1 && (
          <ScrollButton direction="left" label="이전 담당자" onClick={() => scrollByColumn(-1)} />
        )}
        <div
          ref={scrollRef}
          className="roster-h-scroll roster-scroll flex-1 min-w-0 overflow-x-auto overflow-y-visible snap-x snap-proximity scroll-px-2 pb-2"
        >
          <div className="flex items-start gap-4 w-max py-0.5">{children}</div>
        </div>
        {managers.length > 1 && (
          <ScrollButton direction="right" label="다음 담당자" onClick={() => scrollByColumn(1)} />
        )}
      </div>
    </div>
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
  onFeeChange,
  feeRefreshKeys,
}: {
  clients: ClientRecord[];
  sort: 'name' | 'code';
  query: string;
  returnTo: string;
  visibleManagers: string[];
  visibleOptionalCategories: string[];
  currentUserName?: string | null;
  onFeeChange?: (id: string, payload: FeeBreakdownSave) => void;
  feeRefreshKeys?: Record<string, number>;
}) {
  // visibleManagers는 호출부에서 사용자가 지정한 순서대로 전달된다 → 그 순서를 그대로 유지
  const managerGroups = useMemo(() => {
    const grouped = groupClientsByManager(clients, sort);
    const byManager = new Map(grouped.map(g => [g.manager, g.clients]));

    return visibleManagers.map(manager => ({
      manager,
      clients: byManager.get(manager) ?? [],
    }));
  }, [clients, sort, visibleManagers]);

  if (visibleManagers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-600">표시할 담당자를 선택해 주세요</p>
        <p className="portal-meta mt-1 text-xs">필터에서 담당자를 선택하세요</p>
      </div>
    );
  }

  return (
    <HorizontalRosterStrip
      managers={managerGroups.map(g => g.manager)}
      currentUserName={currentUserName}
    >
      {managerGroups.map(mgr => (
        <div
          key={mgr.manager}
          className="snap-start shrink-0 flex flex-col w-[min(520px,calc(100vw-3rem))]"
        >
          <ManagerSection
            manager={mgr.manager}
            clients={mgr.clients}
            query={query}
            returnTo={returnTo}
            isSelf={Boolean(currentUserName && mgr.manager === currentUserName)}
            visibleOptionalCategories={visibleOptionalCategories}
            onFeeChange={onFeeChange}
            feeRefreshKeys={feeRefreshKeys}
          />
        </div>
      ))}
    </HorizontalRosterStrip>
  );
}

export { MANAGER_DISPLAY_ORDER };
