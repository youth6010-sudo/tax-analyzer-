'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientRecord } from '@/app/types/client';
import { STAFF_REAL_NAMES } from '@/app/config/dataSources';
import {
  compareManagers,
  groupClientsByManager,
  MANAGER_DISPLAY_ORDER,
  sumClientFees,
} from '@/app/utils/clientsGrouping';
import { formatBusinessNo, formatCorporateNo, formatResidentNo } from '@/app/utils/idFormat';

function formatFee(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}

function splitPersonalCorporate(clients: ClientRecord[]) {
  const personal: ClientRecord[] = [];
  const corporate: ClientRecord[] = [];
  for (const c of clients) {
    if (c.businessEntityType === 'corporate') corporate.push(c);
    else personal.push(c);
  }
  return { personal, corporate };
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
      <mark className="bg-amber-200/90 text-gray-900 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

function dash(value: string): string {
  return value.trim() || '—';
}

function panelIdLabel(variant: 'personal' | 'corporate'): string {
  return variant === 'corporate' ? '법인번호' : '주민번호';
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

/** 헤더·행 공통 컬럼 (# · 업체명 · 대표 · 사업자 · 주민/법인 · 연락 · 기장료 · 콜베) */
const ROW_GRID =
  'grid grid-cols-[1.5rem_minmax(4.5rem,1.15fr)_minmax(2.75rem,0.55fr)_minmax(5rem,0.8fr)_minmax(5rem,0.85fr)_minmax(3.5rem,0.65fr)_minmax(4.5rem,max-content)_1.75rem] gap-x-2 items-center';

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
        'truncate text-sm leading-snug text-gray-700',
        mono ? 'font-mono text-[13px] text-gray-800' : 'font-medium',
      ].join(' ')}
      title={value}
    >
      {value === '—' ? <span className="text-gray-300">—</span> : query ? <Highlight text={value} query={query} /> : value}
    </span>
  );
}

function FeeCell({
  clientId,
  value,
  onSave,
}: {
  clientId: string;
  value: number | null;
  onSave?: (id: string, fee: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const display = value != null && Number.isFinite(value) ? value.toLocaleString('ko-KR') : '—';

  const startEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraft(value != null && Number.isFinite(value) ? String(value) : '');
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const commit = () => {
    setEditing(false);
    const raw = draft.trim().replace(/,/g, '');
    const next = raw === '' ? null : Number(raw);
    if (raw !== '' && (Number.isNaN(next) || next! < 0)) return;
    if ((value ?? null) === next) return;
    onSave?.(clientId, next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^\d,]/g, ''))}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') setEditing(false);
        }}
        onClick={e => e.stopPropagation()}
        className="w-full min-w-[4rem] rounded border border-blue-300 bg-white px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
        aria-label="기장료 수정"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="클릭하여 기장료 수정"
      className="w-full text-right text-sm font-semibold tabular-nums whitespace-nowrap text-gray-900 hover:bg-blue-50 hover:text-blue-900 rounded px-1.5 py-1 transition-colors"
    >
      {display}
    </button>
  );
}

const PANEL = {
  personal: {
    accent: 'border-l-sky-300',
    headerBg: 'bg-sky-50/90',
    headerText: 'text-sky-800',
    badge: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200/80',
    footer: 'bg-sky-50/70 border-sky-100 text-sky-900',
    rowHover: 'hover:bg-sky-50/60',
    colbertChecked: 'bg-amber-50/80',
    dot: 'bg-sky-400',
  },
  corporate: {
    accent: 'border-l-violet-300',
    headerBg: 'bg-violet-50/90',
    headerText: 'text-violet-800',
    badge: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200/80',
    footer: 'bg-violet-50/70 border-violet-100 text-violet-900',
    rowHover: 'hover:bg-violet-50/60',
    colbertChecked: 'bg-amber-50/80',
    dot: 'bg-violet-400',
  },
} as const;

type PanelStyles = (typeof PANEL)[keyof typeof PANEL];

function RosterColumnHeader({ idLabel }: { idLabel: string }) {
  return (
    <div
      className={[
        ROW_GRID,
        'sticky top-0 z-10 px-2.5 py-2 text-xs font-bold text-gray-500',
        'bg-white/95 backdrop-blur-sm border-b border-gray-200',
      ].join(' ')}
    >
      <span className="text-center normal-case">#</span>
      <span className="normal-case">업체명</span>
      <span className="normal-case">대표</span>
      <span className="normal-case">사업자</span>
      <span className="normal-case">{idLabel}</span>
      <span className="normal-case">연락</span>
      <span className="text-right normal-case">기장료</span>
      <span className="text-center normal-case" title="콜베르">
        콜베
      </span>
    </div>
  );
}

function ClientRosterRow({
  client: c,
  index,
  variant,
  query,
  styles,
  onGo,
  onColbertToggle,
  onFeeChange,
}: {
  client: ClientRecord;
  index: number;
  variant: 'personal' | 'corporate';
  query: string;
  styles: PanelStyles;
  onGo: (id: string, e: React.MouseEvent) => void;
  onColbertToggle?: (id: string, colbert: boolean) => void;
  onFeeChange?: (id: string, fee: number | null) => void;
}) {
  const isChurned = c.status === 'churned';
  const rep = dash(c.representative);
  const biz = dash(formatBusinessNo(c.businessNo));
  const idVal = panelIdValue(c, variant);
  const contact = contactDisplay(c);

  return (
    <li
      className={[
        ROW_GRID,
        'px-2.5 py-2 transition-colors duration-100 border-b border-gray-100/80 last:border-b-0',
        styles.rowHover,
        index % 2 === 1 ? 'bg-gray-50/50' : 'bg-white',
        c.colbert ? styles.colbertChecked : '',
        isChurned ? 'opacity-45' : '',
      ].join(' ')}
    >
      <span className="text-xs font-medium text-gray-400 tabular-nums text-center">{index + 1}</span>

      <a
        href={`/clients/${c.id}`}
        onClick={e => onGo(c.id, e)}
        className={[
          'truncate text-sm font-bold text-gray-900 min-w-0',
          'hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 rounded-sm',
          isChurned ? 'line-through decoration-red-300/80 text-gray-500' : '',
        ].join(' ')}
        title={c.companyName}
      >
        <Highlight text={c.companyName} query={query} />
      </a>

      <CellValue value={rep} query={query} />
      <CellValue value={biz} mono query={query} />
      <CellValue value={idVal} mono query={query} />
      <CellValue value={contact} mono query={query} />

      <FeeCell clientId={c.id} value={c.feeSummary} onSave={onFeeChange} />

      <span className="flex justify-center">
        <input
          type="checkbox"
          checked={c.colbert}
          aria-label={`${c.companyName} 콜베르`}
          className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
          onClick={e => e.stopPropagation()}
          onChange={e => {
            e.stopPropagation();
            onColbertToggle?.(c.id, e.target.checked);
          }}
        />
      </span>
    </li>
  );
}

const MANAGER_THEME: Record<string, { bar: string; text: string; chip: string; avatar: string }> = {
  블루: {
    bar: 'bg-gradient-to-r from-sky-50 to-blue-50 border-sky-100',
    text: 'text-sky-900',
    chip: 'bg-sky-100/80 text-sky-800 ring-sky-200/60',
    avatar: 'bg-sky-200/70 text-sky-800',
  },
  다야: {
    bar: 'bg-gradient-to-r from-rose-50 to-pink-50 border-rose-100',
    text: 'text-rose-900',
    chip: 'bg-rose-100/80 text-rose-800 ring-rose-200/60',
    avatar: 'bg-rose-200/70 text-rose-800',
  },
  윈터: {
    bar: 'bg-gradient-to-r from-cyan-50 to-teal-50 border-cyan-100',
    text: 'text-teal-900',
    chip: 'bg-cyan-100/80 text-teal-800 ring-cyan-200/60',
    avatar: 'bg-cyan-200/70 text-teal-800',
  },
  리아: {
    bar: 'bg-gradient-to-r from-fuchsia-50 to-purple-50 border-fuchsia-100',
    text: 'text-purple-900',
    chip: 'bg-fuchsia-100/80 text-purple-800 ring-fuchsia-200/60',
    avatar: 'bg-fuchsia-200/70 text-purple-800',
  },
  페리: {
    bar: 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100',
    text: 'text-amber-900',
    chip: 'bg-amber-100/80 text-amber-800 ring-amber-200/60',
    avatar: 'bg-amber-200/70 text-amber-800',
  },
  인디: {
    bar: 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-100',
    text: 'text-emerald-900',
    chip: 'bg-emerald-100/80 text-emerald-800 ring-emerald-200/60',
    avatar: 'bg-emerald-200/70 text-emerald-800',
  },
  찰리: {
    bar: 'bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-100',
    text: 'text-indigo-900',
    chip: 'bg-indigo-100/80 text-indigo-800 ring-indigo-200/60',
    avatar: 'bg-indigo-200/70 text-indigo-800',
  },
};

const DEFAULT_MANAGER_THEME = {
  bar: 'bg-gradient-to-r from-slate-50 to-gray-50 border-slate-200',
  text: 'text-slate-800',
  chip: 'bg-slate-100/80 text-slate-700 ring-slate-200/60',
  avatar: 'bg-slate-200/70 text-slate-700',
};

function EntityPanel({
  title,
  variant,
  clients,
  query,
  onGo,
  onColbertToggle,
  onFeeChange,
}: {
  title: string;
  variant: 'personal' | 'corporate';
  clients: ClientRecord[];
  query: string;
  onGo: (id: string, e: React.MouseEvent) => void;
  onColbertToggle?: (id: string, colbert: boolean) => void;
  onFeeChange?: (id: string, fee: number | null) => void;
}) {
  const feeSum = sumClientFees(clients);
  const s = PANEL[variant];
  const idLabel = panelIdLabel(variant);

  return (
    <div
      className={[
        'flex flex-col h-[min(380px,40vh)] min-h-[200px] min-w-0',
        'rounded-xl border border-gray-200/80 bg-white overflow-hidden',
        'shadow-sm border-l-[3px]',
        s.accent,
      ].join(' ')}
    >
      <div className={`shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 ${s.headerBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} aria-hidden />
          <h3 className={`text-sm font-bold ${s.headerText}`}>{title}</h3>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${s.badge}`}>
          {clients.length}건
        </span>
      </div>

      <div className="roster-scroll flex-1 min-h-0 overflow-auto overscroll-contain">
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-gray-400">
            <p className="text-sm">수임처 없음</p>
          </div>
        ) : (
          <div className="w-full min-w-0">
            <RosterColumnHeader idLabel={idLabel} />
            <ul>
              {clients.map((c, i) => (
                <ClientRosterRow
                  key={c.id}
                  client={c}
                  index={i}
                  variant={variant}
                  query={query}
                  styles={s}
                  onGo={onGo}
                  onColbertToggle={onColbertToggle}
                  onFeeChange={onFeeChange}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={`shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t text-sm ${s.footer}`}>
        <span className="font-medium opacity-80">{title} 합계</span>
        <span className="tabular-nums font-semibold whitespace-nowrap">
          {clients.length}건 · {formatFee(feeSum)}
        </span>
      </div>
    </div>
  );
}

function StatChip({ label, value, chipClass }: { label: string; value: string; chipClass: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        chipClass,
      ].join(' ')}
    >
      <span className="opacity-60">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

function ManagerSection({
  manager,
  clients,
  query,
  returnTo,
  isSelf,
  onColbertToggle,
  onFeeChange,
}: {
  manager: string;
  clients: ClientRecord[];
  query: string;
  returnTo: string;
  isSelf?: boolean;
  onColbertToggle?: (id: string, colbert: boolean) => void;
  onFeeChange?: (id: string, fee: number | null) => void;
}) {
  const router = useRouter();
  const realName = STAFF_REAL_NAMES[manager];
  const { personal, corporate } = splitPersonalCorporate(clients);
  const totalFee = sumClientFees(clients);
  const theme = MANAGER_THEME[manager] ?? DEFAULT_MANAGER_THEME;

  const go = (clientId: string, e: React.MouseEvent) => {
    e.preventDefault();
    let from = returnTo ?? '';
    if (from) {
      const u = new URL(from, window.location.origin);
      u.searchParams.set('scroll', String(Math.round(window.scrollY)));
      from = u.pathname + u.search;
    }
    const q = from ? `?from=${encodeURIComponent(from)}` : '';
    router.push(`/clients/${clientId}${q}`);
  };

  return (
    <section
      className={[
        'rounded-xl overflow-hidden bg-white',
        'shadow-sm ring-1 ring-gray-200/70',
        isSelf ? 'ring-2 ring-blue-300/60' : '',
      ].join(' ')}
    >
      <div className={`relative px-4 py-2.5 border-b ${theme.bar}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${theme.avatar}`}
            aria-hidden
          >
            {manager.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className={`text-base font-bold tracking-tight ${theme.text}`}>{manager}</h2>
              {isSelf && (
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                  내 담당
                </span>
              )}
              {realName && realName !== manager && (
                <span className={`text-sm opacity-70 ${theme.text}`}>{realName}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <StatChip label="개인" value={String(personal.length)} chipClass={theme.chip} />
            <StatChip label="법인" value={String(corporate.length)} chipClass={theme.chip} />
            <StatChip label="합계" value={String(clients.length)} chipClass={theme.chip} />
          </div>
        </div>
      </div>

      <div className="p-2 grid grid-cols-1 lg:grid-cols-2 gap-2 bg-gray-50/50">
        <EntityPanel
          title="개인"
          variant="personal"
          clients={personal}
          query={query}
          onGo={go}
          onColbertToggle={onColbertToggle}
          onFeeChange={onFeeChange}
        />
        <EntityPanel
          title="법인"
          variant="corporate"
          clients={corporate}
          query={query}
          onGo={go}
          onColbertToggle={onColbertToggle}
          onFeeChange={onFeeChange}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-100/80 border-t border-gray-200/80 text-sm text-gray-700">
        <span className="font-semibold text-gray-600">총계</span>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <span className="rounded-md bg-sky-50 px-2.5 py-1 font-medium tabular-nums text-sky-800 ring-1 ring-sky-100 whitespace-nowrap">
            개인 {personal.length} · {formatFee(sumClientFees(personal))}
          </span>
          <span className="rounded-md bg-violet-50 px-2.5 py-1 font-medium tabular-nums text-violet-800 ring-1 ring-violet-100 whitespace-nowrap">
            법인 {corporate.length} · {formatFee(sumClientFees(corporate))}
          </span>
          <span className="rounded-md bg-white px-2.5 py-1 font-semibold tabular-nums text-gray-800 ring-1 ring-gray-200 whitespace-nowrap">
            {clients.length}건 · {formatFee(totalFee)}
          </span>
        </div>
      </div>
    </section>
  );
}

/** 담당자 세로 배치 · 개인/법인 좌우 · 체크한 담당자만 */
export default function ManagerRosterGrid({
  clients,
  sort,
  query,
  returnTo,
  visibleManagers,
  currentUserName,
  onColbertToggle,
  onFeeChange,
}: {
  clients: ClientRecord[];
  sort: 'name' | 'code';
  query: string;
  returnTo: string;
  visibleManagers: string[];
  currentUserName?: string | null;
  onColbertToggle?: (id: string, colbert: boolean) => void;
  onFeeChange?: (id: string, fee: number | null) => void;
}) {
  const managerGroups = useMemo(() => {
    const grouped = groupClientsByManager(clients, sort);
    const byManager = new Map(grouped.map(g => [g.manager, g.clients]));

    return visibleManagers
      .slice()
      .sort((a, b) => {
        if (currentUserName) {
          if (a === currentUserName) return -1;
          if (b === currentUserName) return 1;
        }
        return compareManagers(a, b);
      })
      .map(manager => ({
        manager,
        clients: byManager.get(manager) ?? [],
      }));
  }, [clients, sort, visibleManagers, currentUserName]);

  if (visibleManagers.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
        <p className="text-base font-semibold text-gray-600">표시할 담당자를 선택해 주세요</p>
        <p className="text-sm text-gray-400 mt-1">위 「담당자 표시」에서 체크하세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {managerGroups.map(mgr => (
        <ManagerSection
          key={mgr.manager}
          manager={mgr.manager}
          clients={mgr.clients}
          query={query}
          returnTo={returnTo}
          isSelf={Boolean(currentUserName && mgr.manager === currentUserName)}
          onColbertToggle={onColbertToggle}
          onFeeChange={onFeeChange}
        />
      ))}
    </div>
  );
}

export { MANAGER_DISPLAY_ORDER };
