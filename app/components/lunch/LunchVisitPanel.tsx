'use client';

import { useEffect, useState } from 'react';
import type { LunchSpotJournal, LunchVisit } from '@/app/types/lunchJournal';
import { formatVisitDate, getAverageRating, getVisitOnDate, todayDateStr } from '@/app/utils/lunchJournal';
import StarRating from './StarRating';

interface LunchVisitFormProps {
  spotName: string;
  initialRating?: number;
  initialReview?: string;
  submitLabel?: string;
  onSaved: (rating: number, review: string) => void;
  onCancel?: () => void;
}

export function LunchVisitForm({
  spotName,
  initialRating = 4,
  initialReview = '',
  submitLabel = '먹은 날 기록하기',
  onSaved,
  onCancel,
}: LunchVisitFormProps) {
  const [rating, setRating] = useState(initialRating);
  const [review, setReview] = useState(initialReview);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRating(initialRating);
    setReview(initialReview);
  }, [initialRating, initialReview]);

  const handleSubmit = () => {
    if (rating < 1) return;
    onSaved(rating, review);
    setSaved(true);
    if (!initialReview) setReview('');
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
      <p className="text-sm font-semibold text-gray-800">{spotName}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">별점</span>
        <StarRating value={rating} onChange={setRating} />
      </div>
      <textarea
        value={review}
        onChange={e => setReview(e.target.value)}
        placeholder="한 줄 리뷰 (선택)"
        rows={2}
        className="mt-3 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-orange-200"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="px-4 py-2 text-sm font-bold rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
        >
          {saved ? '저장됨 ✓' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            취소
          </button>
        )}
      </div>
    </div>
  );
}

function VisitEditRow({
  visit,
  onSave,
  onCancel,
}: {
  visit: LunchVisit;
  onSave: (rating: number, review: string) => void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(visit.rating);
  const [review, setReview] = useState(visit.review);

  return (
    <li className="text-xs bg-orange-50 border border-orange-100 rounded-lg px-3 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-700">{formatVisitDate(visit.date)}</span>
        <StarRating value={rating} onChange={setRating} size="sm" />
      </div>
      <textarea
        value={review}
        onChange={e => setReview(e.target.value)}
        rows={2}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(rating, review)}
          className="px-2 py-1 text-xs font-bold rounded-lg bg-orange-500 text-white"
        >
          수정 저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200"
        >
          취소
        </button>
      </div>
    </li>
  );
}

interface LunchVisitHistoryProps {
  journal: LunchSpotJournal;
  onEditVisit?: (visitId: string, rating: number, review: string) => void;
  onDeleteVisit?: (visitId: string) => void;
}

export function LunchVisitHistory({ journal, onEditVisit, onDeleteVisit }: LunchVisitHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (journal.visits.length === 0) return null;

  const avg = getAverageRating(journal);
  const recent = [...journal.visits].reverse().slice(0, 5);

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      {avg !== null && (
        <p className="text-sm font-semibold text-amber-600">
          ★ {avg}{' '}
          <span className="text-gray-400 font-normal text-xs">({journal.visits.length}회)</span>
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {recent.map(v =>
          editingId === v.id ? (
            <VisitEditRow
              key={v.id}
              visit={v}
              onSave={(rating, review) => {
                onEditVisit?.(v.id, rating, review);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <li key={v.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-700">{formatVisitDate(v.date)}</span>
                  <StarRating value={v.rating} size="sm" />
                  <span className="text-gray-400">· {v.author}</span>
                </div>
                <div className="flex gap-1">
                  {onEditVisit && (
                    <button
                      type="button"
                      onClick={() => setEditingId(v.id)}
                      className="px-2 py-0.5 text-[10px] font-semibold rounded border border-gray-200 hover:bg-white"
                    >
                      수정
                    </button>
                  )}
                  {onDeleteVisit && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('이 기록을 삭제할까요?')) onDeleteVisit(v.id);
                      }}
                      className="px-2 py-0.5 text-[10px] font-semibold rounded border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              {v.review && <p className="mt-1 text-gray-600">{v.review}</p>}
              {v.updatedAt && (
                <p className="mt-0.5 text-[10px] text-gray-400">수정됨</p>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export function getTodayVisitDefaults(journal: LunchSpotJournal | null | undefined) {
  if (!journal) {
    return { initialRating: 4, initialReview: '', hasToday: false };
  }
  const today = getVisitOnDate(journal, todayDateStr());
  return {
    initialRating: today?.rating ?? 4,
    initialReview: today?.review ?? '',
    hasToday: !!today,
  };
}
