'use client';

import type { LunchSpot } from '@/app/types/lunch';
import type { KickSide } from './penaltyScene';

export type PenaltyOutcomeMap = {
  goalSpot: LunchSpot;
  missSpot: LunchSpot;
};

interface LunchPenaltySetupProps {
  pool: LunchSpot[];
  slotAId: string;
  slotBId: string;
  goalSpotId: string;
  disabled?: boolean;
  onSlotAChange: (id: string) => void;
  onSlotBChange: (id: string) => void;
  onAssignGoal: (spotId: string) => void;
  onRandomPair: () => void;
  onKick: (side: KickSide) => void;
}

function SpotSelect({
  label,
  value,
  otherId,
  pool,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  otherId: string;
  pool: LunchSpot[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-emerald-300/80 uppercase tracking-wider">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-2.5 py-2 text-sm font-semibold rounded-lg border border-emerald-400/30 bg-slate-900/80 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-50"
      >
        <option value="">가게 선택…</option>
        {pool.map(spot => (
          <option key={spot.id} value={spot.id} disabled={spot.id === otherId && spot.id !== value}>
            {spot.name} (도보 {spot.walkMinutes}분)
          </option>
        ))}
      </select>
    </label>
  );
}

function SpotRoleCard({
  spot,
  role,
  disabled,
  onSetGoal,
  onSetMiss,
}: {
  spot: LunchSpot;
  role: 'goal' | 'miss' | null;
  disabled?: boolean;
  onSetGoal: () => void;
  onSetMiss: () => void;
}) {
  return (
    <div
      className={`rounded-xl border-2 p-3 sm:p-4 ${
        role === 'goal'
          ? 'border-amber-400/60 bg-amber-950/40'
          : role === 'miss'
            ? 'border-sky-400/60 bg-sky-950/40'
            : 'border-slate-600/50 bg-slate-900/50'
      }`}
    >
      <span className="text-sm sm:text-base font-black text-white leading-snug break-keep">{spot.name}</span>
      <span className="mt-1 block text-[10px] text-emerald-100/70">도보 {spot.walkMinutes}분 · {spot.category}</span>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onSetGoal}
          className={`px-2.5 py-1 text-[10px] font-black rounded-full border transition-colors disabled:opacity-50 ${
            role === 'goal'
              ? 'bg-amber-500/40 text-amber-100 border-amber-400/60'
              : 'bg-slate-800/60 text-amber-200/80 border-amber-400/30 hover:bg-amber-950/50'
          }`}
        >
          ⚽ 골 넣으면
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onSetMiss}
          className={`px-2.5 py-1 text-[10px] font-black rounded-full border transition-colors disabled:opacity-50 ${
            role === 'miss'
              ? 'bg-sky-500/40 text-sky-100 border-sky-400/60'
              : 'bg-slate-800/60 text-sky-200/80 border-sky-400/30 hover:bg-sky-950/50'
          }`}
        >
          🧤 못 넣으면
        </button>
      </div>
    </div>
  );
}

export default function LunchPenaltySetup({
  pool,
  slotAId,
  slotBId,
  goalSpotId,
  disabled,
  onSlotAChange,
  onSlotBChange,
  onAssignGoal,
  onRandomPair,
  onKick,
}: LunchPenaltySetupProps) {
  const spotA = pool.find(s => s.id === slotAId) ?? null;
  const spotB = pool.find(s => s.id === slotBId) ?? null;
  const ready = spotA && spotB && spotA.id !== spotB.id && goalSpotId && goalSpotId !== '';
  const missSpotId =
    ready && spotA && spotB
      ? goalSpotId === spotA.id
        ? spotB.id
        : spotA.id
      : '';

  return (
    <div className="mt-4 rounded-2xl border-2 border-emerald-400/50 bg-gradient-to-b from-emerald-950/40 to-slate-900/80 p-4 sm:p-5">
      <p className="text-center text-xs font-bold uppercase tracking-widest text-emerald-300/80">
        ⚽ 승부차기 — 가게 2곳 직접 선택
      </p>
      <p className="mt-1 text-center text-[11px] text-emerald-100/60">
        가게를 고른 뒤 각각 「골 넣으면 / 못 넣으면」 지정 · 성공 확률 50%
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SpotSelect
          label="가게 1"
          value={slotAId}
          otherId={slotBId}
          pool={pool}
          onChange={onSlotAChange}
          disabled={disabled}
        />
        <SpotSelect
          label="가게 2"
          value={slotBId}
          otherId={slotAId}
          pool={pool}
          onChange={onSlotBChange}
          disabled={disabled}
        />
      </div>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          disabled={disabled || pool.length < 2}
          onClick={onRandomPair}
          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-400/30 text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
        >
          🎲 랜덤 2곳 채우기
        </button>
      </div>

      {spotA && spotB && spotA.id !== spotB.id && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <SpotRoleCard
            spot={spotA}
            role={goalSpotId === spotA.id ? 'goal' : missSpotId === spotA.id ? 'miss' : null}
            disabled={disabled}
            onSetGoal={() => onAssignGoal(spotA.id)}
            onSetMiss={() => onAssignGoal(spotB.id)}
          />
          <SpotRoleCard
            spot={spotB}
            role={goalSpotId === spotB.id ? 'goal' : missSpotId === spotB.id ? 'miss' : null}
            disabled={disabled}
            onSetGoal={() => onAssignGoal(spotB.id)}
            onSetMiss={() => onAssignGoal(spotA.id)}
          />
        </div>
      )}

      {spotA && spotB && spotA.id === spotB.id && (
        <p className="mt-3 text-center text-xs text-amber-300">서로 다른 가게를 골라 주세요.</p>
      )}

      {ready && spotA && spotB && (
        <p className="mt-3 text-center text-[11px] text-emerald-100/50">
          ⚽ 골 → {goalSpotId === spotA.id ? spotA.name : spotB.name} · 🧤 막힘 →{' '}
          {goalSpotId === spotA.id ? spotB.name : spotA.name}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
        <button
          type="button"
          disabled={disabled || !ready}
          onClick={() => onKick('left')}
          className="py-3 text-sm font-black rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow-lg hover:from-sky-500 hover:to-sky-400 active:scale-95 disabled:opacity-50"
        >
          ← 왼쪽 슛
        </button>
        <button
          type="button"
          disabled={disabled || !ready}
          onClick={() => onKick('right')}
          className="py-3 text-sm font-black rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg hover:from-rose-500 hover:to-rose-400 active:scale-95 disabled:opacity-50"
        >
          오른쪽 슛 →
        </button>
      </div>
    </div>
  );
}

export function buildOutcomeMap(goalSpot: LunchSpot, missSpot: LunchSpot): PenaltyOutcomeMap {
  return { goalSpot, missSpot };
}

export function pickRandomPair(pool: LunchSpot[]): [string, string] | null {
  if (pool.length < 2) return null;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0].id, shuffled[1].id];
}
