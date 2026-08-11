'use client';

import Link from 'next/link';
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import HomeTasksPanel from './HomeTasksPanel';
import HomeSidebarNav from './HomeSidebarNav';
import PresenceHeartbeat from './PresenceHeartbeat';
import StaffPresencePanel from './StaffPresencePanel';
import InfraStatusChip from './InfraStatusChip';
import { MenuPrefsProvider } from './MenuPrefsProvider';
import ContactHeaderSearch from '@/app/components/ContactHeaderSearch';
import AppHeaderUser from '@/app/components/AppHeaderUser';
import PortalPrefetch from '@/app/components/PortalPrefetch';

const LEFT_WIDTH_KEY = 'portalLeftNavWidth.v1';
const RIGHT_WIDTH_KEY = 'portalRightTasksWidth.v1';
const RIGHT_MODE_KEY = 'portalRightTasksMode.v1';
const DEFAULT_LEFT = 240;
const DEFAULT_RIGHT = 280;
const MIN_LEFT = 180;
const MAX_LEFT = 420;
const MIN_RIGHT = 200;
const MAX_RIGHT = 480;
const COLLAPSED_RIGHT = 40;
const TODO_OPEN_ADD_KEY = 'portalTodoOpenAdd.v1';

type RightMode = 'open' | 'collapsed';

function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function readStoredRightMode(): RightMode {
  if (typeof window === 'undefined') return 'open';
  try {
    const stored = localStorage.getItem(RIGHT_MODE_KEY);
    if (stored === 'open' || stored === 'collapsed') return stored;
    if (stored === 'hidden') return 'collapsed';
  } catch {
    /* ignore */
  }
  return 'open';
}

function useResize(
  width: number,
  setWidth: (w: number) => void,
  storageKey: string,
  min: number,
  max: number,
  direction: 'left' | 'right',
) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const persist = useCallback(
    (w: number) => {
      try {
        localStorage.setItem(storageKey, String(w));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    const next =
      direction === 'left'
        ? Math.min(max, Math.max(min, startWidth.current + delta))
        : Math.min(max, Math.max(min, startWidth.current - delta));
    setWidth(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const delta = e.clientX - startX.current;
    const next =
      direction === 'left'
        ? Math.min(max, Math.max(min, startWidth.current + delta))
        : Math.min(max, Math.max(min, startWidth.current - delta));
    setWidth(next);
    persist(next);
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}

function PortalBrand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="세무법인 청년들"
        className="h-10 w-auto max-w-[5.5rem] object-contain shrink-0"
      />
      <div className="min-w-0 leading-tight">
        <p className="text-sm font-extrabold text-slate-800">B-System</p>
        <p className="text-[11px] font-medium text-slate-500">부산지점 업무 포털</p>
      </div>
    </Link>
  );
}

export default function PortalShellLayout({ children }: { children: React.ReactNode }) {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT);
  const [rightMode, setRightMode] = useState<RightMode>('open');

  useLayoutEffect(() => {
    setLeftWidth(readStoredWidth(LEFT_WIDTH_KEY, DEFAULT_LEFT, MIN_LEFT, MAX_LEFT));
    setRightWidth(readStoredWidth(RIGHT_WIDTH_KEY, DEFAULT_RIGHT, MIN_RIGHT, MAX_RIGHT));
    setRightMode(readStoredRightMode());
  }, []);

  const leftResize = useResize(leftWidth, setLeftWidth, LEFT_WIDTH_KEY, MIN_LEFT, MAX_LEFT, 'left');
  const rightResize = useResize(rightWidth, setRightWidth, RIGHT_WIDTH_KEY, MIN_RIGHT, MAX_RIGHT, 'right');

  const setRightModePersist = (mode: RightMode) => {
    setRightMode(mode);
    try {
      localStorage.setItem(RIGHT_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const effectiveRightWidth = rightMode === 'collapsed' ? COLLAPSED_RIGHT : rightWidth;

  return (
    <MenuPrefsProvider>
    <div className="flex min-h-[100dvh] w-full">
      <PortalPrefetch />
      <aside
        className="fixed left-0 top-0 z-40 h-[100dvh] shrink-0 border-r border-slate-200 bg-white print:hidden"
        style={{ width: leftWidth }}
      >
        <div className="flex h-full flex-col overflow-hidden px-2.5 py-2 pr-3.5">
          <PortalBrand />
          <InfraStatusChip />
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1">
            <HomeSidebarNav />
          </div>
          <StaffPresencePanel />
          <PresenceHeartbeat />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="메뉴 너비 조절"
          onPointerDown={leftResize.onPointerDown}
          onPointerMove={leftResize.onPointerMove}
          onPointerUp={leftResize.onPointerUp}
          onPointerCancel={leftResize.onPointerUp}
          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-blue-200/60 active:bg-blue-300/70"
        />
      </aside>

      <div
        className="flex min-w-0 flex-1 flex-col print:!m-0"
        style={
          {
            marginLeft: leftWidth,
            marginRight: effectiveRightWidth,
            '--portal-left-w': `${leftWidth}px`,
            '--portal-right-w': `${effectiveRightWidth}px`,
          } as CSSProperties
        }
      >
        <header className="sticky top-0 z-[35] shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-md px-3 py-2 no-print print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <ContactHeaderSearch expanded />
            </div>
            <AppHeaderUser />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>

      <aside
        className="fixed right-0 top-0 z-40 h-[100dvh] shrink-0 border-l border-slate-200 bg-slate-50 transition-[width] duration-200 print:hidden"
        style={{ width: effectiveRightWidth }}
      >
        {rightMode === 'open' && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="To Do List 너비 조절"
            onPointerDown={rightResize.onPointerDown}
            onPointerMove={rightResize.onPointerMove}
            onPointerUp={rightResize.onPointerUp}
            onPointerCancel={rightResize.onPointerUp}
            className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-blue-200/60 active:bg-blue-300/70"
          />
        )}
        <div className="flex h-full flex-col overflow-hidden">
          {rightMode === 'collapsed' ? (
            <div className="flex h-full flex-col items-center gap-2 py-3">
              <button
                type="button"
                onClick={() => setRightModePersist('open')}
                className="rounded-md border border-[#4b6cb7]/30 bg-white p-1.5 text-[10px] font-bold text-[#4b6cb7] shadow-sm hover:bg-blue-50"
                title="펼치기"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.setItem(TODO_OPEN_ADD_KEY, 'personal');
                  } catch {
                    /* ignore */
                  }
                  setRightModePersist('open');
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#4b6cb7] text-base font-bold leading-none text-white shadow-sm hover:bg-[#3d5a9a]"
                title="체크리스트 추가"
                aria-label="체크리스트 추가"
              >
                +
              </button>
              <span
                className="text-[10px] font-bold text-[#4b6cb7] [writing-mode:vertical-rl]"
                style={{ textOrientation: 'mixed' }}
              >
                To Do List
              </span>
            </div>
          ) : rightMode === 'open' ? (
            <div className="flex min-h-0 flex-1 flex-col p-2">
              <div className="mb-1 flex shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setRightModePersist('collapsed')}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                  title="접기"
                >
                  접기
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <HomeTasksPanel />
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
    </MenuPrefsProvider>
  );
}
