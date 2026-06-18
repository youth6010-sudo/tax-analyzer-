'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import type { CategorySection } from '@/app/utils/clientsGrouping';
import { groupClientsByCategoryColumns, groupClientsByManager, getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import {
  clearColumnLayout,
  hasCustomColumnLayout,
  moveCategoryToColumn,
  readColumnLayout,
  type CategoryColumnSide,
} from '@/app/utils/clientsColumnLayout';
import ClientRowLine, { ClientListHeader } from '@/app/components/clients/ClientRowLine';

const DRAG_MIME = 'application/x-clients-category';

const CATEGORY_ACCENT: Record<string, { bar: string; header: string; badge: string }> = {
  개인: { bar: 'border-l-blue-500', header: 'text-blue-900', badge: 'bg-blue-100 text-blue-800' },
  법인: { bar: 'border-l-violet-500', header: 'text-violet-900', badge: 'bg-violet-100 text-violet-800' },
  신고대리: { bar: 'border-l-amber-500', header: 'text-amber-900', badge: 'bg-amber-100 text-amber-800' },
  미사용: { bar: 'border-l-gray-400', header: 'text-gray-700', badge: 'bg-gray-100 text-gray-600' },
  비사업자: { bar: 'border-l-teal-500', header: 'text-teal-900', badge: 'bg-teal-100 text-teal-800' },
};

const DEFAULT_ACCENT = {
  bar: 'border-l-slate-400',
  header: 'text-gray-800',
  badge: 'bg-slate-100 text-slate-700',
};

function categoryAccent(category: string) {
  return CATEGORY_ACCENT[category] ?? DEFAULT_ACCENT;
}

function ClientList({
  clients,
  query,
  returnTo,
  showCode,
}: {
  clients: ClientRecord[];
  query: string;
  returnTo: string;
  showCode: boolean;
}) {
  return (
    <>
      <ClientListHeader showCode={showCode} />
      {clients.map((c, i) => (
        <ClientRowLine
          key={c.id}
          client={c}
          query={query}
          returnTo={returnTo}
          striped={i % 2 === 1}
          showCode={showCode}
        />
      ))}
    </>
  );
}

function sectionShowsCode(clients: ClientRecord[], sort: 'name' | 'code'): boolean {
  return sort === 'code' || clients.some(c => Boolean(getClientDouzoneCode(c)));
}

function CategoryBlock({
  section,
  query,
  returnTo,
  mineOnly,
  sort,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  section: CategorySection;
  query: string;
  returnTo: string;
  mineOnly: boolean;
  sort: 'name' | 'code';
  isDragging: boolean;
  onDragStart: (category: string) => void;
  onDragEnd: () => void;
}) {
  const managerGroups = useMemo(
    () => (mineOnly ? null : groupClientsByManager(section.clients, sort)),
    [mineOnly, section.clients, sort],
  );
  const accent = categoryAccent(section.category);
  const showCode = sectionShowsCode(section.clients, sort);

  return (
    <section
      className={`flex flex-col min-h-0 flex-1 basis-0 transition-opacity ${isDragging ? 'opacity-40' : ''}`}
    >
      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.setData(DRAG_MIME, section.category);
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(section.category);
        }}
        onDragEnd={onDragEnd}
        className={`shrink-0 flex items-center gap-2 mb-2 pl-2 pr-1 py-1 -ml-1 rounded-lg border-l-4 cursor-grab active:cursor-grabbing select-none hover:bg-white/80 ${accent.bar}`}
        title="드래그하여 다른 열로 이동"
      >
        <span className="text-gray-300 text-xs leading-none" aria-hidden>
          ⠿
        </span>
        <h3 className={`text-base font-bold ${accent.header}`}>{section.category}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${accent.badge}`}>
          {section.clients.length}
        </span>
      </div>
      <div className="flex-1 min-h-[140px] overflow-y-auto overscroll-y-contain rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.02]">
        {mineOnly || !managerGroups ? (
          <ClientList clients={section.clients} query={query} returnTo={returnTo} showCode={showCode} />
        ) : (
          managerGroups.map(mgr => (
            <div key={mgr.manager} className="border-b border-gray-100 last:border-b-0">
              <p className="sticky top-0 z-20 flex items-center gap-1.5 text-sm font-semibold text-gray-700 px-3 py-2.5 bg-slate-100/95 border-b border-gray-200 backdrop-blur-sm">
                <span className="inline-block w-1 h-3.5 rounded-full bg-slate-400" aria-hidden />
                {mgr.manager}
                <span className="font-normal text-gray-400 tabular-nums">({mgr.clients.length})</span>
              </p>
              <ClientList
                clients={mgr.clients}
                query={query}
                returnTo={returnTo}
                showCode={sectionShowsCode(mgr.clients, sort)}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function CategoryColumn({
  side,
  sections,
  query,
  returnTo,
  mineOnly,
  sort,
  draggingCategory,
  dropActive,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  side: CategoryColumnSide;
  sections: CategorySection[];
  query: string;
  returnTo: string;
  mineOnly: boolean;
  sort: 'name' | 'code';
  draggingCategory: string | null;
  dropActive: boolean;
  onDragStart: (category: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const sideLabel = side === 'left' ? '열 A' : '열 B';

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        'flex flex-col min-h-0 h-full rounded-2xl border p-3 lg:p-4 shadow-sm transition-colors',
        dropActive
          ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-200/80'
          : 'border-gray-200/80 bg-gray-50/60',
      ].join(' ')}
    >
      <div className="shrink-0 mb-3 pb-2 border-b border-gray-200/70">
        <p className="text-xs font-bold tracking-wide text-gray-500 uppercase">{sideLabel}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">대분류 제목을 드래그해 이동</p>
      </div>
      <div className="flex flex-col gap-4 min-h-0 flex-1">
        {sections.length === 0 ? (
          <div
            className={[
              'flex flex-1 items-center justify-center min-h-[160px] rounded-xl border-2 border-dashed',
              dropActive ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-white/40',
            ].join(' ')}
          >
            <p className="text-sm text-gray-400">여기로 놓기</p>
          </div>
        ) : (
          sections.map(section => (
            <CategoryBlock
              key={section.category}
              section={section}
              query={query}
              returnTo={returnTo}
              mineOnly={mineOnly}
              sort={sort}
              isDragging={draggingCategory === section.category}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** 2열 — 대분류마다 독립 스크롤, 제목 드래그로 열 이동 */
export default function EntityPairGrid({
  clients,
  sort,
  query,
  returnTo,
  mineOnly,
}: {
  clients: ClientRecord[];
  sort: 'name' | 'code';
  query: string;
  returnTo: string;
  mineOnly: boolean;
}) {
  const [columnLayout, setColumnLayout] = useState<Record<string, CategoryColumnSide>>({});
  const [layoutReady, setLayoutReady] = useState(false);
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CategoryColumnSide | null>(null);

  useEffect(() => {
    setColumnLayout(readColumnLayout() ?? {});
    setLayoutReady(true);
  }, []);

  const { left, right } = useMemo(
    () => groupClientsByCategoryColumns(clients, sort, columnLayout),
    [clients, sort, columnLayout],
  );

  const allCategories = useMemo(
    () => [...left, ...right].map(s => s.category),
    [left, right],
  );

  const customLayout = hasCustomColumnLayout(columnLayout, allCategories);

  const handleMove = useCallback((category: string, side: CategoryColumnSide) => {
    setColumnLayout(prev => moveCategoryToColumn(prev, category, side));
  }, []);

  const handleResetLayout = useCallback(() => {
    clearColumnLayout();
    setColumnLayout({});
  }, []);

  const makeDropHandlers = (side: CategoryColumnSide) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(side);
    },
    onDragLeave: () => {
      setDropTarget(prev => (prev === side ? null : prev));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const category = e.dataTransfer.getData(DRAG_MIME);
      setDropTarget(null);
      setDraggingCategory(null);
      if (category) handleMove(category, side);
    },
  });

  if (clients.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
        표시할 수임처가 없습니다.
      </p>
    );
  }

  if (!layoutReady) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
        레이아웃 불러오는 중…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {customLayout && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleResetLayout}
            className="text-xs text-gray-500 hover:text-blue-600 underline-offset-2 hover:underline"
          >
            열 배치 기본값으로
          </button>
        </div>
      )}
      <div
        className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6 min-h-[480px]"
        style={{ height: 'clamp(480px, calc(100vh - 260px), 960px)' }}
      >
        <CategoryColumn
          side="left"
          sections={left}
          query={query}
          returnTo={returnTo}
          mineOnly={mineOnly}
          sort={sort}
          draggingCategory={draggingCategory}
          dropActive={dropTarget === 'left' && draggingCategory !== null}
          onDragStart={setDraggingCategory}
          onDragEnd={() => {
            setDraggingCategory(null);
            setDropTarget(null);
          }}
          {...makeDropHandlers('left')}
        />
        <CategoryColumn
          side="right"
          sections={right}
          query={query}
          returnTo={returnTo}
          mineOnly={mineOnly}
          sort={sort}
          draggingCategory={draggingCategory}
          dropActive={dropTarget === 'right' && draggingCategory !== null}
          onDragStart={setDraggingCategory}
          onDragEnd={() => {
            setDraggingCategory(null);
            setDropTarget(null);
          }}
          {...makeDropHandlers('right')}
        />
      </div>
    </div>
  );
}
