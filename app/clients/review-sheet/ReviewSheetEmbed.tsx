'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import ReviewHubTabs from '@/app/components/clients/ReviewHubTabs';
import {
  DEFAULT_REVIEW_TAX_YEAR,
  REVIEW_TAX_YEARS,
  normalizeReviewTaxYear,
} from '@/lib/review/taxYear';

const REVIEW_TAX_YEAR_STORAGE_KEY = 'reviewTaxYear';

/** review/*.js 캐시 무효화 — 검토표 스크립트 수정 시 올려서 구버전·신버전 혼용 방지 */
const REVIEW_ASSET_VERSION = '20260723a';

const SCRIPT_GROUPS = [
  ['/review/review-auth.js'],
  ['/review/review-grid-core.js', '/review/review-grid-edit.js'],
  [
    '/review/review-grid-sections.js',
    '/review/review-readable.js',
    '/review/review-row-expand.js',
  ],
  ['/review/review-add-client.js', '/review/review-client-list.js', '/review/review-board-view.js'],
  ['/review/review-grid-dashboard.js', '/review/review-grid.js'],
];

type BootStatus = 'loading' | 'ready' | 'error';

type MountResult = {
  ok: boolean;
  reason?: 'superseded' | 'error';
  message?: string;
};

type MountOpts = {
  onReady?: () => void;
  onError?: (message: string) => void;
};

function readStoredTaxYear(): number {
  try {
    return normalizeReviewTaxYear(sessionStorage.getItem(REVIEW_TAX_YEAR_STORAGE_KEY));
  } catch {
    return DEFAULT_REVIEW_TAX_YEAR;
  }
}

async function loadReviewScripts(): Promise<void> {
  for (const group of SCRIPT_GROUPS) {
    await Promise.all(group.map(src => loadScript(src)));
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-review-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = `${src}?v=${REVIEW_ASSET_VERSION}`;
    el.async = false;
    el.dataset.reviewSrc = src;
    el.onload = () => resolve();
    el.onerror = () => {
      el.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.body.appendChild(el);
  });
}

async function loadScript(src: string): Promise<void> {
  try {
    await loadScriptOnce(src);
  } catch {
    // 일시적 네트워크 오류 — 한 번 자동 재시도
    await new Promise(resolve => setTimeout(resolve, 500));
    await loadScriptOnce(src);
  }
}

function ensureReviewStylesheet() {
  if (document.querySelector('link[data-review-grid-css="1"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/review/review-grid.css?v=${REVIEW_ASSET_VERSION}`;
  link.dataset.reviewGridCss = '1';
  document.head.appendChild(link);
}

export default function ReviewSheetEmbed() {
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const remountRef = useRef<(() => void) | null>(null);
  const bootStatusRef = useRef<BootStatus>('loading');
  const [meta, setMeta] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [bootStatus, setBootStatus] = useState<BootStatus>('loading');
  const [taxYear, setTaxYear] = useState(DEFAULT_REVIEW_TAX_YEAR);

  useEffect(() => {
    setTaxYear(readStoredTaxYear());
  }, []);

  const setBootStatusSafe = useCallback((status: BootStatus) => {
    bootStatusRef.current = status;
    setBootStatus(status);
  }, []);

  const runMount = useCallback(async (cancelled: () => boolean) => {
    const root = rootRef.current;
    if (!root || cancelled()) return;

    setBootStatusSafe('loading');
    setError(null);

    const mountOpts: MountOpts = {
      onReady: () => {
        if (!cancelled()) setBootStatusSafe('ready');
      },
      onError: (message: string) => {
        if (!cancelled()) {
          setBootStatusSafe('error');
          setError(message);
        }
      },
    };

    const mountTimer = window.setTimeout(() => {
      if (cancelled()) return;
      if (bootStatusRef.current !== 'loading') return;
      setBootStatusSafe('error');
      setError(
        '검토표 로드가 지연되고 있습니다. 잠시 후 새로고침하거나 npm run dev:clean 후 다시 시도해 주세요.',
      );
    }, 45000);

    try {
      const result = (await window.ReviewGridApp?.mount?.(root, mountOpts)) as MountResult | undefined;
      if (cancelled()) return;
      if (result?.ok === false && result.reason === 'error' && result.message) {
        setBootStatusSafe('error');
        setError(result.message);
      }
    } finally {
      window.clearTimeout(mountTimer);
    }
  }, [setBootStatusSafe]);

  useEffect(() => {
    const owner = searchParams.get('owner');
    const tab = searchParams.get('tab');
    const focus = searchParams.get('focus');
    try {
      if (owner) sessionStorage.setItem('reviewSelectedPanel', `panel-${owner}`);
      if (tab) sessionStorage.setItem('reviewTaxTab', tab === 'corp' ? 'corp' : 'income');
    } catch {
      /* ignore */
    }
    if (owner || tab || focus) {
      window.__REVIEW_DEEP_LINK__ = { owner, tab, focus };
    }
  }, [searchParams]);

  useLayoutEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    const year = taxYear;

    (async () => {
      try {
        window.__REVIEW_EMBED__ = true;
        window.__REVIEW_CLIENT_LINKS_INDEX__ = window.__REVIEW_CLIENT_LINKS_INDEX__ || {};
        window.__REVIEW_PATCHES_READY__ = false;
        ensureReviewStylesheet();

        const INDEX_FETCH_MS = 10_000;
        const indexController = new AbortController();
        const indexTimeout = window.setTimeout(() => indexController.abort(), INDEX_FETCH_MS);

        const indexPromise = fetch('/api/review/client-links-index', {
          credentials: 'same-origin',
          signal: indexController.signal,
        })
          .then(res => (res.ok ? res.json() : { index: {} }))
          .then(data => {
            if (cancelled) return;
            if (window.ReviewClientList?.installClientLinksIndex) {
              window.ReviewClientList.installClientLinksIndex(data.index || {});
            } else {
              window.__REVIEW_CLIENT_LINKS_INDEX__ = data.index || {};
            }
          })
          .catch(() => {
            if (!cancelled) window.__REVIEW_CLIENT_LINKS_INDEX__ = {};
          })
          .finally(() => {
            window.clearTimeout(indexTimeout);
          });

        await loadReviewScripts();
        if (cancelled) return;

        void indexPromise;

        const sessionRes = await fetch(`/api/review/session?year=${year}`);
        if (!sessionRes.ok) {
          let detail = '';
          try {
            const errBody = await sessionRes.json();
            detail = errBody?.error ? String(errBody.error) : '';
          } catch {
            /* ignore */
          }
          throw new Error(detail || '세션을 불러오지 못했습니다.');
        }
        const session = await sessionRes.json();
        if (cancelled) return;

        window.__REVIEW_SESSION__ = session;

        if (window.ReviewAuth?.initFromPortal) {
          await window.ReviewAuth.initFromPortal(session);
        }
        if (cancelled) return;

        if (session.gridMeta?.importedAt) {
          const d = new Date(session.gridMeta.importedAt);
          const modeLabel = session.isMaster
            ? '마스터 편집'
            : session.canEdit
              ? '본인 시트 편집'
              : '읽기 전용';
          setMeta(`${year}년 귀속 · ${modeLabel} · ${d.toLocaleString('ko-KR')}`);
        } else if (session.gridReady === false) {
          setMeta(`${year}년 귀속 · 검토표 데이터 없음 — npm run import:review`);
        } else {
          setMeta(`${year}년 귀속`);
        }

        if (window.ReviewGridEdit?.initStorage) {
          void window.ReviewGridEdit.initStorage().finally(() => {
            if (!cancelled) window.__REVIEW_PATCHES_READY__ = true;
          });
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.hidden = true;

        if (!window.ReviewGridApp?.mount) {
          throw new Error('검토표 스크립트를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        }

        await runMount(isCancelled);
      } catch (e) {
        if (!cancelled) {
          setBootStatusSafe('error');
          setError(e instanceof Error ? e.message : '검토표 로드 실패');
        }
      }
    })();

    remountRef.current = () => {
      if (cancelled) return;
      void runMount(isCancelled);
    };

    return () => {
      cancelled = true;
      remountRef.current = null;
      window.__REVIEW_PATCHES_READY__ = false;
      window.ReviewAuth?.resetEmbed?.();
      window.ReviewGridEdit?.resetEmbed?.();
      window.ReviewGridApp?.reset?.();
    };
  }, [runMount, taxYear]);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) remountRef.current?.();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const onTaxYearChange = (next: number) => {
    const y = normalizeReviewTaxYear(next);
    try {
      sessionStorage.setItem(REVIEW_TAX_YEAR_STORAGE_KEY, String(y));
    } catch {
      /* ignore */
    }
    setTaxYear(y);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PortalPageHeader
        title="검토표"
        description={meta || '결산 · 부가가치세'}
        icon={<PageHeaderIcon name="review-sheet" />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ReviewHubTabs active="review" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          귀속연도
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800"
            value={taxYear}
            onChange={e => onTaxYearChange(Number(e.target.value))}
          >
            {REVIEW_TAX_YEARS.map(y => (
              <option key={y} value={y}>
                {y}년{y === DEFAULT_REVIEW_TAX_YEAR ? ' (현재자료)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && bootStatus === 'error' ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      <div
        ref={rootRef}
        id="review-page"
        className="review-page review-embed-root flex min-h-0 flex-1 flex-col"
      >
        <div className="page-sticky-bar mb-3 pb-3">
          <div className="page-sticky-row page-sticky-row--tools">
            <div className="tax-tabs" id="tax-tabs" />
            <input
              type="search"
              className="search-input"
              id="search-input"
              placeholder="성명·상호·연락처·비고 검색"
            />
            <div className="page-sticky-actions">
              <span className="patch-status" id="patch-status" />
              <div className="edit-tools" id="edit-tools" hidden>
                <button type="button" className="tool-btn tool-btn-primary" id="board-edit-btn">
                  편집
                </button>
                <button type="button" className="tool-btn tool-btn-primary" id="board-save-btn" hidden>
                  저장
                </button>
                <button type="button" className="tool-btn" id="export-patches-btn">
                  패치보내기
                </button>
                <button type="button" className="tool-btn tool-btn-danger" id="clear-patches-btn">
                  변경 초기화
                </button>
              </div>
            </div>
          </div>
        </div>
        <nav
          className="manager-chips"
          id="manager-chips"
          hidden
          aria-label="담당자"
        />
        <div className="relative flex min-h-0 flex-1 flex-col">
          {bootStatus === 'loading' ? (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-white/90"
              aria-live="polite"
            >
              <p className="loading">데이터 불러오는 중…</p>
            </div>
          ) : null}
          <div className="grid-scroll flex min-h-0 flex-1 flex-col" id="grid-scroll" />
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __REVIEW_EMBED__?: boolean;
    __REVIEW_SESSION__?: {
      canEdit?: boolean;
      canEditLayout?: boolean;
      isMaster?: boolean;
      isIndie?: boolean;
      listLayouts?: Record<string, Array<string | number>>;
      listWidths?: Record<string, Record<string, number>>;
      gridMeta?: { importedAt?: string };
      gridReady?: boolean;
    };
    __REVIEW_PATCHES_READY__?: boolean;
    __REVIEW_CLIENT_LINKS_INDEX__?: Record<
      string,
      {
        linked: boolean;
        clients: { id: string; companyName: string; href: string; status?: string }[];
        primary: { id: string; companyName: string; href: string } | null;
        manual: boolean;
      }
    >;
    __REVIEW_DEEP_LINK__?: { owner?: string | null; tab?: string | null; focus?: string | null };
    ReviewAuth?: {
      initFromPortal?: (session: unknown) => Promise<void>;
      resetEmbed?: () => void;
      requireUser?: () => string | null;
      isMaster?: (user: string) => Promise<boolean>;
      loadAccessConfig?: () => Promise<unknown>;
    };
    ReviewGridEdit?: {
      initStorage?: () => Promise<void>;
      resetEmbed?: () => void;
    };
    ReviewGridApp?: {
      mount?: (root: HTMLElement, opts?: MountOpts) => Promise<MountResult | void>;
      reset?: () => void;
    };
    ReviewClientList?: {
      installClientLinksIndex?: (index: Record<string, unknown>) => void;
    };
  }
}
