'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientRecord, ClientSearchResult } from '@/app/types/client';
import { hydratePortal, prefetchSearchIndex } from '@/app/utils/portalStore';
import { mergeClientSearchResults } from '@/app/utils/searchNormalize';
import { useIsMasterUser } from '@/app/utils/useIsMasterUser';
import { noticeBtnSecondary, noticeInput, noticeLabel } from './noticeUi';

export type PickedClient = { id: string; companyName: string };

type ReviewKeyHint = {
  reviewKey: string;
  reviewName: string;
  owners: string[];
  taxKinds: string[];
  focusOwner?: string;
  focusRow?: number;
};

type Props = {
  value: PickedClient | null;
  onSelect: (client: PickedClient | null) => void;
  /** 수임처 미연결 시 안내문에 쓸 업체명 */
  draftCompanyName?: string;
  onDraftCompanyNameChange?: (name: string) => void;
  /** 신고대상확인 링크용 세목 */
  filingTax?: string;
  /** 검토표 링크 표시 — 법인세·종소세만 (부가세·면세 등 제외) */
  showReviewLink?: boolean;
};

function reviewSheetHref(hint: ReviewKeyHint): string {
  const params = new URLSearchParams();
  const owner = hint.focusOwner ?? hint.owners[0];
  if (owner) params.set('owner', owner);
  if (hint.taxKinds.includes('income')) params.set('tab', 'income');
  else if (hint.taxKinds.some(k => k === 'corp-tax' || k === 'corp-fee')) params.set('tab', 'corp');
  params.set('focus', hint.reviewKey);
  return `/clients/review-sheet?${params.toString()}`;
}

const actionLinkClass =
  'inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50';

export default function NoticeClientPicker({
  value,
  onSelect,
  draftCompanyName = '',
  onDraftCompanyNameChange,
  filingTax = 'comprehensive',
  showReviewLink = false,
}: Props) {
  const isMaster = useIsMasterUser();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [reviewHint, setReviewHint] = useState<ReviewKeyHint | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startConnectSearch = useCallback((seed?: string) => {
    const q = (seed ?? draftCompanyName ?? '').trim();
    if (q) setQuery(q);
    setOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [draftCompanyName]);

  useEffect(() => {
    hydratePortal();
    void prefetchSearchIndex();
  }, []);

  useEffect(() => {
    if (!value?.id || !showReviewLink) {
      setReviewHint(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/review/client-id-review-map`)
      .then(r => (r.ok ? r.json() : { byClientId: {} }))
      .then(data => {
        if (cancelled) return;
        const hints = (data.byClientId?.[value.id] ?? []) as ReviewKeyHint[];
        // 법인세·종소세 검토표만 사용
        const eligible = hints.find(h =>
          h.taxKinds?.some(k => k === 'income' || k === 'corp-tax' || k === 'corp-fee'),
        );
        setReviewHint(eligible ?? null);
      })
      .catch(() => {
        if (!cancelled) setReviewHint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value?.id, showReviewLink]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q || isMaster === null) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const local: ClientRecord[] = [];
      setResults(local);
      setLoading(true);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const params = new URLSearchParams({ q, scope: 'notice' });
      if (!isMaster) params.set('mineOnly', '1');

      fetch(`/api/clients/search?${params.toString()}`, { signal: ac.signal })
        .then(r => (r.ok ? r.json() : { clients: [] }))
        .then(data => {
          const api = (data.clients ?? []) as ClientSearchResult[];
          setResults(mergeClientSearchResults(local, api));
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setResults(local);
        })
        .finally(() => setLoading(false));
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isMaster]);

  if (value) {
    const filingHref = `/clients/filing-check?tax=${encodeURIComponent(filingTax)}&client=${encodeURIComponent(value.id)}`;
    const reviewHref = reviewHint ? reviewSheetHref(reviewHint) : null;

    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                연결됨
              </span>
              <Link
                href={`/clients/${value.id}`}
                prefetch={false}
                className="truncate text-sm font-semibold text-blue-700 hover:underline"
                title="수임처 상세"
              >
                {value.companyName}
              </Link>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">세목별 입력 자동 저장</p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`${noticeBtnSecondary} !px-2 !py-1 text-xs`}
          >
            해제
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Link href={`/clients/${value.id}`} prefetch={false} className={actionLinkClass}>
            수임처
          </Link>
          {showReviewLink && reviewHref ? (
            <Link href={reviewHref} prefetch={false} className={actionLinkClass}>
              검토표
            </Link>
          ) : null}
          <Link href={filingHref} prefetch={false} className={actionLinkClass}>
            신고확인
          </Link>
        </div>
      </div>
    );
  }

  const searchPlaceholder = isMaster
    ? '수임처 검색 (업체명·사업자번호·대표자)'
    : '내 담당 수임처 검색';

  const draftTrimmed = draftCompanyName.trim();

  return (
    <div className="space-y-2">
      {onDraftCompanyNameChange && (
        <label className="block min-w-0">
          <span className={noticeLabel}>안내문 표기용 업체명</span>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <input
              type="text"
              value={draftCompanyName}
              onChange={e => onDraftCompanyNameChange(e.target.value)}
              placeholder="예) (주)○○건설 — {업체명} 토큰에 삽입"
              className={`${noticeInput} min-w-0 flex-1 !py-1.5 text-xs`}
            />
            {draftTrimmed ? (
              <button
                type="button"
                onClick={() => startConnectSearch(draftTrimmed)}
                className={`${noticeBtnSecondary} shrink-0 !px-2 !py-1.5 text-xs font-semibold text-blue-700`}
              >
                연결
              </button>
            ) : null}
          </div>
          {draftTrimmed ? (
            <p className="mt-1 text-[11px] text-slate-500">
              수임처 미연결 시 안내문 본문의 {'{업체명}'}에 들어갑니다. 「연결」로 수임처를 찾으면
              세목별 입력이 자동 저장됩니다.
            </p>
          ) : null}
        </label>
      )}

      <div ref={rootRef} className="relative">
        {draftTrimmed && onDraftCompanyNameChange ? (
          <button
            type="button"
            onClick={() => startConnectSearch(draftTrimmed)}
            className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
          >
            <span className="text-[11px] font-semibold text-slate-500">미연결</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
              {draftTrimmed}
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-blue-600">수임처 연결 →</span>
          </button>
        ) : null}

        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={e => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (!next.trim()) {
              setResults([]);
              setLoading(false);
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder={searchPlaceholder}
          className={`${noticeInput} w-full !py-1.5 text-xs`}
        />

        {open && query.trim() && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {isMaster === null || (loading && results.length === 0) ? (
              <p className="px-3 py-3 text-center text-sm text-slate-400">검색 중…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-center text-sm text-slate-500">검색 결과 없음</p>
            ) : (
              results.map(client => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: client.id, companyName: client.companyName });
                    setQuery('');
                    setOpen(false);
                  }}
                  className="w-full border-b border-slate-100 px-3 py-2 text-left transition last:border-0 hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-800">{client.companyName}</p>
                  <p className="text-xs text-slate-500">
                    {[client.manager, client.businessNo, client.representative]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
