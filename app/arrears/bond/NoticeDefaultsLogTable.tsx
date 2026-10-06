'use client';

import type { BondNoticeDefaultsLogEntry } from '@/app/types/bond';

const dot = (iso: string) => (iso ? iso.replace(/-/g, '.') : '-');

function savedAtKo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const TH = 'whitespace-nowrap border-r border-slate-200 px-2.5 py-2 text-center last:border-r-0';
const TD = 'whitespace-nowrap border-r border-slate-100 px-2.5 py-1.5 text-center last:border-r-0';

/** 해임통보 일괄 날짜 저장 이력 — 최근 저장순, 맨 위가 현재 적용값 */
export default function NoticeDefaultsLogTable({ log }: { log: BondNoticeDefaultsLogEntry[] }) {
  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-100 font-bold text-slate-700">
          <tr>
            <th className={TH}>저장 시각</th>
            <th className={TH}>저장자</th>
            <th className={TH}>발신일</th>
            <th className={TH}>입금기한</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {log.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-10 text-center text-slate-500">
                저장 이력이 없습니다.
              </td>
            </tr>
          ) : (
            log.map((l, i) => (
              <tr key={`${l.savedAt}-${i}`} className={i === 0 ? 'bg-blue-50/50 text-slate-900' : 'text-slate-700'}>
                <td className={`${TD} tabular-nums`}>{savedAtKo(l.savedAt)}</td>
                <td className={TD}>{l.savedBy || '-'}</td>
                <td className={`${TD} tabular-nums`}>{dot(l.sentDate)}</td>
                <td className={`${TD} tabular-nums`}>{dot(l.deadline)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
