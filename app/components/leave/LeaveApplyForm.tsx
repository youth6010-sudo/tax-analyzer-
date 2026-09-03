'use client';

import { useEffect, useState } from 'react';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import type { LeaveHalfSlot, LeaveKind } from '@/app/types/leave';

/** 휴가 종류·기간으로 신청 내용 초안 생성 */
export function buildLeaveBodyDraft(
  leaveKind: LeaveKind,
  halfSlot: LeaveHalfSlot,
  startDate: string,
  endDate: string,
): string {
  if (leaveKind === 'half') {
    const slot = halfSlot === 'pm' ? '오후 반차' : '오전 반차';
    return `${slot} 승인 요청 드립니다. (${startDate}, 0.5일)`;
  }
  const end = endDate || startDate;
  if (!startDate) return '연차 승인 요청 드립니다.';
  if (startDate === end) {
    return `연차 승인 요청 드립니다. (${startDate}, 1일)`;
  }
  const a = new Date(`${startDate}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const days =
    Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a
      ? 0
      : Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
  if (days < 1) return `연차 승인 요청 드립니다. (${startDate} ~ ${end})`;
  return `연차 승인 요청 드립니다. (${startDate} ~ ${end}, ${days}일)`;
}

export function buildLeaveTitleDraft(
  leaveKind: LeaveKind,
  halfSlot: LeaveHalfSlot,
): string {
  if (leaveKind === 'half') {
    return halfSlot === 'pm' ? '오후 반차' : '오전 반차';
  }
  return '연차';
}

type SubstituteOptions = {
  defaultSubstitute: string | null;
  defaultAvailable: boolean;
  mustPickOther: boolean;
  candidates: string[];
  suggested: string;
};

export default function LeaveApplyForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [leaveKind, setLeaveKind] = useState<LeaveKind>('full');
  const [halfSlot, setHalfSlot] = useState<LeaveHalfSlot>('am');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [title, setTitle] = useState(() => buildLeaveTitleDraft('full', 'am'));
  const [body, setBody] = useState(() => buildLeaveBodyDraft('full', 'am', today, today));
  const [bodyDirty, setBodyDirty] = useState(false);
  const [substituteName, setSubstituteName] = useState('');
  const [subOpts, setSubOpts] = useState<SubstituteOptions | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (leaveKind === 'half') {
      setEndDate(startDate);
    }
    setTitle(buildLeaveTitleDraft(leaveKind, halfSlot));
    if (!bodyDirty) {
      setBody(
        buildLeaveBodyDraft(
          leaveKind,
          halfSlot,
          startDate,
          leaveKind === 'half' ? startDate : endDate,
        ),
      );
    }
  }, [leaveKind, halfSlot, startDate, endDate, bodyDirty]);

  useEffect(() => {
    const start = startDate;
    const end = leaveKind === 'half' ? startDate : endDate;
    if (!start || !end) return;
    let cancelled = false;
    setSubLoading(true);
    void (async () => {
      try {
        const qs = new URLSearchParams({ startDate: start, endDate: end });
        const res = await fetch(`/api/leave/substitute-options?${qs}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || '대체자 조회 실패');
        if (cancelled) return;
        const opts = data as SubstituteOptions;
        setSubOpts(opts);
        setSubstituteName(opts.suggested || '');
      } catch (e) {
        if (!cancelled) {
          setSubOpts(null);
          setError(e instanceof Error ? e.message : '대체자 조회 실패');
        }
      } finally {
        if (!cancelled) setSubLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, leaveKind]);

  const submit = async () => {
    if (!substituteName.trim()) {
      setError('업무대체자를 지정해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          leaveKind,
          halfSlot: leaveKind === 'half' ? halfSlot : '',
          startDate,
          endDate: leaveKind === 'half' ? startDate : endDate,
          substituteName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '신청 실패');
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : '신청 실패');
    } finally {
      setSaving(false);
    }
  };

  const canEditSubstitute = !subOpts?.defaultAvailable;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        팀원이면 팀장 승인 후 인디 최종 결재로 올라갑니다. 그 외는 인디에게 바로 결재 요청됩니다.
        업무대체자는 필수이며, 기본은 블루↔다야 · 페리↔윈터 · 리아↔찰리입니다. 기본 대체자도 같은
        기간 연차면 다른 사람을 지정합니다.
      </p>
      <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            checked={leaveKind === 'full'}
            onChange={() => setLeaveKind('full')}
          />
          연차
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            checked={leaveKind === 'half'}
            onChange={() => setLeaveKind('half')}
          />
          반차
        </label>
      </div>
      {leaveKind === 'half' && (
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              checked={halfSlot === 'am'}
              onChange={() => setHalfSlot('am')}
            />
            오전 반차
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              checked={halfSlot === 'pm'}
              onChange={() => setHalfSlot('pm')}
            />
            오후 반차
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-600">시작일</span>
          <input
            type="date"
            value={startDate}
            onChange={e => {
              setStartDate(e.target.value);
              if (leaveKind === 'half') setEndDate(e.target.value);
            }}
            className={portalInput + ' w-full text-xs'}
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-600">종료일</span>
          <input
            type="date"
            value={endDate}
            disabled={leaveKind === 'half'}
            onChange={e => setEndDate(e.target.value)}
            className={portalInput + ' w-full text-xs disabled:bg-slate-100'}
          />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-slate-600">업무대체자</span>
        {subLoading ? (
          <p className="text-[11px] text-slate-400">대체자 확인 중…</p>
        ) : (
          <select
            value={substituteName}
            disabled={!canEditSubstitute && !!subOpts?.defaultSubstitute}
            onChange={e => setSubstituteName(e.target.value)}
            className={portalInput + ' w-full text-xs disabled:bg-slate-100'}
          >
            {!substituteName ? <option value="">선택</option> : null}
            {(canEditSubstitute ? subOpts?.candidates || [] : [substituteName].filter(Boolean)).map(
              name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ),
            )}
          </select>
        )}
        {subOpts?.mustPickOther ? (
          <p className="mt-1 text-[11px] font-semibold text-amber-800">
            기본 대체자({subOpts.defaultSubstitute})도 같은 기간 연차입니다. 다른 사람을
            지정해 주세요.
          </p>
        ) : subOpts?.defaultSubstitute ? (
          <p className="mt-1 text-[11px] text-slate-500">
            기본 대체자: {subOpts.defaultSubstitute}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">기본 페어가 없어 직접 선택합니다.</p>
        )}
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-slate-600">제목</span>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={portalInput + ' w-full text-xs'}
        />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-slate-600">내용</span>
        <textarea
          value={body}
          onChange={e => {
            setBodyDirty(true);
            setBody(e.target.value);
          }}
          rows={4}
          className={portalInput + ' w-full text-xs'}
          placeholder="종류·기간에 맞춰 자동 작성됩니다. 필요 시 수정하세요."
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || subLoading || !substituteName}
          className={portalBtnPrimary + ' text-xs py-1.5'}
        >
          {saving ? '신청 중…' : '신청'}
        </button>
        <button type="button" onClick={onCancel} className={portalBtnSecondary + ' text-xs py-1.5'}>
          취소
        </button>
      </div>
    </div>
  );
}
