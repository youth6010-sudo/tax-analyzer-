'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import { MANAGER_LEGEND_ORDER } from '@/lib/calendarManagerColors';

type DutySlot = {
  weekStart: string;
  weekEnd: string;
  memberName: string;
  id: string | null;
};

type Props = {
  defaultYear: number;
  defaultMonth: number;
  onSaved?: () => void;
  onCancel?: () => void;
};

function sortMembers(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = MANAGER_LEGEND_ORDER.indexOf(a as (typeof MANAGER_LEGEND_ORDER)[number]);
    const ib = MANAGER_LEGEND_ORDER.indexOf(b as (typeof MANAGER_LEGEND_ORDER)[number]);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, 'ko');
  });
}

function weekLabel(weekStart: string, weekEnd: string): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${Number(m)}.${Number(d)}`;
  };
  return `${fmt(weekStart)}(월) ~ ${fmt(weekEnd)}(금)`;
}

export default function DutyMonthForm({
  defaultYear,
  defaultMonth,
  onSaved,
  onCancel,
}: Props) {
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [team, setTeam] = useState<string[]>([]);
  const [slots, setSlots] = useState<DutySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [canManage, setCanManage] = useState(false);

  const sortedTeam = useMemo(() => sortMembers(team), [team]);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/calendar/duty-weeks?year=${y}&month=${m}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        weeks?: DutySlot[];
        team?: string[];
        canManage?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || '당번을 불러오지 못했습니다.');
        setSlots([]);
        return;
      }
      setSlots(data.weeks || []);
      setTeam(data.team || []);
      setCanManage(!!data.canManage);
    } catch {
      setError('당번을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  const setMember = (weekStart: string, memberName: string) => {
    setSlots(prev =>
      prev.map(s => (s.weekStart === weekStart ? { ...s, memberName } : s)),
    );
  };

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/calendar/duty-weeks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          weeks: slots.map(s => ({
            weekStart: s.weekStart,
            memberName: s.memberName.trim() || null,
          })),
        }),
      });
      const data = (await res.json()) as { weeks?: DutySlot[]; error?: string };
      if (!res.ok) {
        setError(data.error || '저장에 실패했습니다.');
        return;
      }
      setSlots(data.weeks || []);
      onSaved?.();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (month <= 1) {
              setYear(y => y - 1);
              setMonth(12);
            } else setMonth(m => m - 1);
          }}
          className="rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold"
        >
          ‹
        </button>
        <span className="min-w-[5.5rem] text-center text-sm font-bold tabular-nums">
          {year}년 {month}월
        </span>
        <button
          type="button"
          onClick={() => {
            if (month >= 12) {
              setYear(y => y + 1);
              setMonth(1);
            } else setMonth(m => m + 1);
          }}
          className="rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold"
        >
          ›
        </button>
      </div>

      <p className="text-xs text-slate-500">
        매주 월~금 당번 한 명을 지정합니다. 비우면 해당 주 당번이 삭제됩니다.
      </p>

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">불러오는 중…</p>
      ) : slots.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">표시할 주차가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {slots.map(slot => (
            <li
              key={slot.weekStart}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5"
            >
              <span className="min-w-[9.5rem] text-sm font-semibold text-slate-800">
                {weekLabel(slot.weekStart, slot.weekEnd)}
              </span>
              <select
                className={portalInput + ' max-w-[12rem] text-sm'}
                value={slot.memberName}
                disabled={!canManage || saving}
                onChange={e => setMember(slot.weekStart, e.target.value)}
              >
                <option value="">(없음)</option>
                {sortedTeam.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className={portalBtnSecondary}>
            닫기
          </button>
        )}
        {canManage && (
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className={portalBtnPrimary}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        )}
      </div>
    </div>
  );
}
