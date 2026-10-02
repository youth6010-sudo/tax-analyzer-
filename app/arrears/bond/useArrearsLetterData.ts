'use client';

import { useEffect, useState } from 'react';
import {
  filterHiddenCancelledTaxInvoiceLines,
  formatArrearsLetterDate,
  hasPriorClosedLetterCycle,
  letterRunningBalances,
  linesForCurrentLetterCycle,
  resolveArrearsLetterAsOfDate,
  type ArrearsEntryDto,
  type ArrearsLetterLineDto,
} from '@/app/types/arrears';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';
import { formatArrearsLetterLineLabels } from '@/lib/arrearsLineLabel';

export type ArrearsLetterData = {
  lines: ArrearsLetterLineDto[];
  labels: string[];
  running: number[];
  /** 미수 수수료 안내 공문 날짜 (2026.09.28) */
  letterDateLabel: string;
  /** 청구 내역 중 가장 이른·늦은 달 YYYY-MM (없으면 '') */
  firstMonth: string;
  lastMonth: string;
  /** 공문 미수 수수료 잔액 (내역 없으면 관리 잔액) */
  balance: number;
};

/** 청구 라벨의 「YYYY년 M월」 범위 */
function monthRange(labels: string[], lines: ArrearsLetterLineDto[]): { first: string; last: string } {
  const keys: string[] = [];
  labels.forEach((l, i) => {
    if (!(lines[i]!.amount > 0)) return;
    const m = /(\d{4})년\s*(\d{1,2})월/.exec(l);
    if (m) keys.push(`${m[1]}-${m[2].padStart(2, '0')}`);
  });
  keys.sort();
  return { first: keys[0] ?? '', last: keys[keys.length - 1] ?? '' };
}

/** 미수 내역 화면 기본(미납 시점부터 표시)과 같은 공문 데이터 */
export function useArrearsLetterData(entryId: string): { data: ArrearsLetterData | null; error: string } {
  const [data, setData] = useState<ArrearsLetterData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout(`/api/arrears/${entryId}`, { cache: 'no-store' }, 20_000)
      .then(async res => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((d as { error?: string }).error || '미수 내역 조회 실패');
        return d as { item: ArrearsEntryDto; lines?: ArrearsLetterLineDto[]; globalAsOfDate?: string };
      })
      .then(d => {
        if (cancelled) return;
        const all = d.lines || [];
        const cycle = hasPriorClosedLetterCycle(all) ? linesForCurrentLetterCycle(all) : all;
        const lines = filterHiddenCancelledTaxInvoiceLines(cycle, d.item.companyName);
        const globalAsOf = d.globalAsOfDate || '';
        const labels = formatArrearsLetterLineLabels(lines, globalAsOf || d.item.asOfDate || '');
        const running = letterRunningBalances(lines);
        const { first, last } = monthRange(labels, lines);
        setData({
          lines,
          labels,
          running,
          letterDateLabel: formatArrearsLetterDate(
            resolveArrearsLetterAsOfDate(globalAsOf, { asOfDate: d.item.asOfDate, letterDate: '' }),
          ),
          firstMonth: first,
          lastMonth: last,
          balance: running.length ? running[running.length - 1]! : d.item.balance,
        });
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패');
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  return { data, error };
}
