'use client';

import { useMemo } from 'react';
import type { LadderBoard } from '@/app/components/gacha/managerLadder';
import { ladderWinnerPoints } from '@/app/components/gacha/managerLadder';

const SVG_W = 360;
const SVG_H = 420;

type ManagerLadderBoardProps = {
  board: LadderBoard;
  companyName: string;
  /** 당첨 경로 열 추적 (없으면 경로 숨김) */
  pathColumns?: number[] | null;
  /** 0~1 경로 드러남 */
  pathProgress: number;
  revealed?: boolean;
};

export default function ManagerLadderBoard({
  board,
  companyName,
  pathColumns,
  pathProgress,
  revealed,
}: ManagerLadderBoardProps) {
  const cols = board.tops.length;
  const padX = 28;
  const topY = 36;
  const bottomY = SVG_H - 40;
  const span = Math.max(1, cols - 1);
  const xAt = (c: number) => (cols === 1 ? SVG_W / 2 : padX + (c / span) * (SVG_W - padX * 2));
  const rowCount = board.rungs.length;
  const rowY = (r: number) => topY + ((r + 0.5) / rowCount) * (bottomY - topY);

  const points = useMemo(() => {
    if (!pathColumns?.length) return [];
    return ladderWinnerPoints(board, pathColumns, SVG_W, SVG_H);
  }, [board, pathColumns]);

  const poly = points.map(p => `${p.x},${p.y}`).join(' ');
  const pathLen = useMemo(() => {
    let len = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return Math.max(1, len);
  }, [points]);

  const dashOffset = pathLen * (1 - Math.min(1, Math.max(0, pathProgress)));

  return (
    <div className="mt-4 mx-auto w-full max-w-md rounded-2xl border-2 border-violet-400/40 bg-gradient-to-b from-violet-950/50 to-slate-950/90 p-3 shadow-xl shadow-violet-900/20">
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80">
        🪜 사다리타기
      </p>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        role="img"
        aria-label="사다리"
      >
        {/* 세로줄 */}
        {board.tops.map((_, c) => (
          <line
            key={`v-${c}`}
            x1={xAt(c)}
            y1={topY}
            x2={xAt(c)}
            y2={bottomY}
            stroke="rgba(196,181,253,0.45)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
        {/* 가로대 */}
        {board.rungs.map((row, r) =>
          row.map((on, c) =>
            on ? (
              <line
                key={`h-${r}-${c}`}
                x1={xAt(c)}
                y1={rowY(r)}
                x2={xAt(c + 1)}
                y2={rowY(r)}
                stroke="rgba(167,139,250,0.85)"
                strokeWidth={3}
                strokeLinecap="round"
              />
            ) : null,
          ),
        )}
        {/* 경로 */}
        {poly ? (
          <polyline
            points={poly}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={pathLen}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 40ms linear' }}
          />
        ) : null}
        {/* 상단 이름 */}
        {board.tops.map((name, c) => (
          <text
            key={`t-${c}`}
            x={xAt(c)}
            y={18}
            textAnchor="middle"
            className="fill-violet-100"
            style={{ fontSize: cols > 5 ? 10 : 12, fontWeight: 800 }}
          >
            {name}
          </text>
        ))}
        {/* 하단: 상호 / 빈칸 */}
        {board.tops.map((_, c) => {
          const isPrize = c === board.prizeCol;
          const label = isPrize
            ? companyName.trim().slice(0, cols > 4 ? 6 : 8) || '상호'
            : '·';
          return (
            <text
              key={`b-${c}`}
              x={xAt(c)}
              y={SVG_H - 14}
              textAnchor="middle"
              className={isPrize && revealed ? 'fill-amber-300' : isPrize ? 'fill-amber-200/90' : 'fill-violet-300/40'}
              style={{ fontSize: isPrize ? (cols > 5 ? 9 : 11) : 14, fontWeight: isPrize ? 800 : 600 }}
            >
              {isPrize ? `🏢${label}` : label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
