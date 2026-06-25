'use client';

import { useState } from 'react';
import type { LunchSpot } from '@/app/types/lunch';
import type { LunchSpotJournal } from '@/app/types/lunchJournal';
import {
  formatVisitDate,
  getAverageRating,
  getLastVisit,
  ateOnDateByAuthor,
  getVisitsOnDate,
  todayDateStr,
  authorKey,
} from '@/app/utils/lunchJournal';
import { LunchVisitForm, LunchVisitHistory, getTodayVisitDefaults } from './LunchVisitPanel';
import { portalBtnSecondary, portalCard } from '@/app/components/portal/uiClasses';

function MapLink({ href, label }: { href: string; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={portalBtnSecondary}
    >
      {label}
    </a>
  );
}

interface LunchSpotCardProps {
  spot: LunchSpot;
  journal?: LunchSpotJournal | null;
  currentAuthor?: string;
  onRecordVisit?: (spotId: string, rating: number, review: string) => void;
  onEditVisit?: (spotId: string, visitId: string, rating: number, review: string) => void;
  onDeleteVisit?: (spotId: string, visitId: string) => void;
  onCancelToday?: (spotId: string) => void;
  showVisitForm?: boolean;
  highlight?: boolean;
}

export default function LunchSpotCard({
  spot,
  journal,
  currentAuthor,
  onRecordVisit,
  onEditVisit,
  onDeleteVisit,
  onCancelToday,
  showVisitForm = false,
  highlight = false,
}: LunchSpotCardProps) {
  const [formOpen, setFormOpen] = useState(showVisitForm);
  const visits = journal?.visits ?? [];
  const avg = journal ? getAverageRating(journal) : null;
  const last = journal ? getLastVisit(journal) : null;
  const author = currentAuthor?.trim() || '익명';
  const ateToday = journal ? ateOnDateByAuthor(journal, todayDateStr(), author) : false;
  const todayOthers = journal
    ? getVisitsOnDate(journal, todayDateStr()).filter(v => authorKey(v.author) !== authorKey(author))
    : [];
  const todayDefaults = getTodayVisitDefaults(journal, author);

  return (
    <article
      className={`${portalCard} p-4 transition-all hover:shadow-md hover:shadow-slate-200/50 ${
        highlight ? 'ring-2 ring-orange-200 border-orange-200' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{spot.name}</h3>
            {ateToday && (
              <span className="inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-green-100 text-green-700 border border-green-200">
                내가 오늘 먹음
              </span>
            )}
            {!ateToday && todayOthers.length > 0 && (
              <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                오늘 {todayOthers.length}명 리뷰
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {spot.category} · 도보 {spot.walkMinutes > 0 ? `${spot.walkMinutes}분` : '—'} ·{' '}
            {spot.priceRange !== '미입력' ? spot.priceRange : '가격 미입력'}
          </p>
          {avg !== null && (
            <p className="mt-1 text-sm text-amber-600 font-medium">
              ★ {avg}{' '}
              <span className="text-slate-400 font-normal text-xs">({visits.length}개 리뷰)</span>
            </p>
          )}
          {last && !ateToday && (
            <p className="mt-0.5 portal-meta">
              마지막 방문 {formatVisitDate(last.date)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <MapLink href={spot.naverMapUrl} label="네이버" />
          <MapLink href={spot.kakaoMapUrl} label="카카오" />
        </div>
      </div>

      {spot.menuHints.length > 0 && (
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-medium text-slate-800">메뉴</span> {spot.menuHints.join(', ')}
        </p>
      )}

      {spot.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {spot.tags.map(tag => (
            <span
              key={tag}
              className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-100"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {journal && journal.visits.length > 0 && (
        <LunchVisitHistory
          journal={journal}
          currentAuthor={author}
          onEditVisit={
            onEditVisit
              ? (visitId, rating, review) => onEditVisit(spot.id, visitId, rating, review)
              : undefined
          }
          onDeleteVisit={
            onDeleteVisit ? visitId => onDeleteVisit(spot.id, visitId) : undefined
          }
        />
      )}

      {ateToday && onCancelToday && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm('오늘 먹음 기록을 취소할까요? (별점·리뷰 삭제)')) {
              onCancelToday(spot.id);
              setFormOpen(false);
            }
          }}
          className="mt-3 w-full py-2 text-sm font-semibold rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
        >
          내 오늘 기록 취소
        </button>
      )}

      {onRecordVisit && !showVisitForm && (
        <button
          type="button"
          onClick={() => setFormOpen(v => !v)}
          className="mt-3 w-full py-2 text-sm font-semibold rounded-xl border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors"
        >
          {formOpen ? '닫기' : ateToday ? '내 오늘 기록 수정' : '오늘 먹었어요 — 리뷰 남기기'}
        </button>
      )}

      {(showVisitForm || formOpen) && onRecordVisit && (
        <LunchVisitForm
          spotName={spot.name}
          initialRating={todayDefaults.initialRating}
          initialReview={todayDefaults.initialReview}
          submitLabel={todayDefaults.hasToday ? '내 오늘 기록 수정' : '리뷰 저장하기'}
          onSaved={(rating, review) => {
            onRecordVisit(spot.id, rating, review);
            if (!showVisitForm) setFormOpen(false);
          }}
          onCancel={showVisitForm ? undefined : () => setFormOpen(false)}
        />
      )}

      {spot.notes && !showVisitForm && !formOpen && (
        <p className="mt-3 text-xs text-gray-500 border-t border-gray-100 pt-3">{spot.notes}</p>
      )}
    </article>
  );
}
