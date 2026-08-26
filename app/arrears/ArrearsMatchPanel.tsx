'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
} from '@/app/components/portal/uiClasses';
import { formatArrearsWon } from '@/app/types/arrears';

type Suggestion = {
  externalCode: string;
  companyName: string;
  balance: number;
  score: number;
};

type LetterRow = {
  entryId: string;
  companyName: string;
  externalCode: string;
  managerName: string;
  letterSoftKey: string;
  letterBalance: number;
  lineCount: number;
  letterDate: string;
  suggestions: Suggestion[];
};

type PickEntry = {
  entryId: string;
  externalCode: string;
  companyName: string;
  balance: number;
  businessNo: string;
  managerName: string;
};

type ReviewPayload = {
  mode: 'db';
  needsLink: LetterRow[];
  pickEntries: PickEntry[];
  letterOnlyCount: number;
  codedCount: number;
  canLink: boolean;
};

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}%`;
}

type Props = {
  onLinked?: () => void;
  onClose?: () => void;
};

export default function ArrearsMatchPanel({ onLinked, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [manualById, setManualById] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [pickQ, setPickQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/pending-letter-links', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '목록 조회 실패');
      const payload = json as ReviewPayload;
      setData(payload);
      setMsg(
        payload.letterOnlyCount
          ? `연결필요 ${payload.letterOnlyCount}건 · 코드 있는 원장 ${payload.codedCount}건`
          : '연결필요 공문 행이 없습니다.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const merge = async (opts: {
    letter: LetterRow;
    targetEntryId: string;
    targetName: string;
    targetCode: string;
    key: string;
  }) => {
    if (!data?.canLink) return;
    if (
      !window.confirm(
        `공문 «${opts.letter.companyName}» → 원장 «${opts.targetName}» (${opts.targetCode})\n` +
          `공문 상세를 바로 옮기고, 연결필요 행은 삭제합니다. 잔액은 원장 잔액을 유지합니다.`,
      )
    ) {
      return;
    }
    setBusyKey(opts.key);
    setError('');
    try {
      const res = await fetch('/api/arrears/merge-letter-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letterEntryId: opts.letter.entryId,
          targetEntryId: opts.targetEntryId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '연결 실패');
      setData(prev => {
        if (!prev) return prev;
        const needsLink = prev.needsLink.filter(r => r.entryId !== opts.letter.entryId);
        return {
          ...prev,
          needsLink,
          letterOnlyCount: needsLink.length,
        };
      });
      setMsg(`연결됨: ${opts.letter.companyName} → ${opts.targetName}`);
      onLinked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusyKey('');
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const qq = q.trim().toLowerCase();
    if (!qq) return data.needsLink;
    return data.needsLink.filter(
      r =>
        r.companyName.toLowerCase().includes(qq) ||
        r.managerName.toLowerCase().includes(qq),
    );
  }, [data, q]);

  const pickFiltered = useMemo(() => {
    if (!data) return [];
    const qq = pickQ.trim().toLowerCase();
    if (!qq) return data.pickEntries;
    return data.pickEntries.filter(
      p =>
        p.companyName.toLowerCase().includes(qq) ||
        p.externalCode.toLowerCase().includes(qq),
    );
  }, [data, pickQ]);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold text-violet-950">연결필요 ↔ 원장 코드 업체</p>
          <p className="text-[11px] text-violet-800/80">
            「연결필요」 공문을 코드 있는 원장 업체에 붙입니다. 누르면 바로 상세가 옮겨집니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${portalBtnSecondary} py-1.5 text-xs`}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? '불러오는 중…' : '다시 불러오기'}
          </button>
          {onClose ? (
            <button type="button" className={`${portalBtnSecondary} py-1.5 text-xs`} onClick={onClose}>
              닫기
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 border-t border-violet-100 px-3 py-3">
        {!data?.canLink ? (
          <p className="text-[11px] text-slate-500">연결 권한이 없습니다.</p>
        ) : null}

        {msg ? <p className="text-xs text-emerald-800">{msg}</p> : null}
        {error ? <p className="text-xs text-rose-700">{error}</p> : null}

        {data && data.letterOnlyCount > 0 ? (
          <>
            <input
              className={`${portalInput} py-1.5 text-xs`}
              placeholder="연결필요 상호·담당 검색"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <div className="max-h-[28rem] space-y-3 overflow-auto">
              {filtered.map(row => {
                const pickId = manualById[row.entryId] || '';
                return (
                  <div
                    key={row.entryId}
                    className="rounded-lg border border-amber-200 bg-white p-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {row.companyName}
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            연결필요
                          </span>
                        </p>
                        <p className="text-slate-500">
                          {row.managerName} · 공문 줄 {row.lineCount}
                          {row.letterDate ? ` · ${row.letterDate}` : ''}
                        </p>
                      </div>
                      <p className="tabular-nums font-semibold text-rose-800">
                        공문 {formatArrearsWon(row.letterBalance)}
                      </p>
                    </div>

                    <ul className="mt-2 space-y-1.5">
                      {row.suggestions.map(s => {
                        const target = data.pickEntries.find(p => p.externalCode === s.externalCode);
                        if (!target) return null;
                        const key = `${row.entryId}:${target.entryId}`;
                        return (
                          <li
                            key={s.externalCode}
                            className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5"
                          >
                            <span className="font-medium">
                              {s.companyName}
                              <span className="ml-1 font-mono text-[10px] text-slate-400">
                                {s.externalCode}
                              </span>
                            </span>
                            <span className="text-slate-500">
                              원장 {formatArrearsWon(s.balance)}
                            </span>
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-900">
                              유사 {scoreLabel(s.score)}
                            </span>
                            <Link
                              href={`/arrears/${target.entryId}`}
                              className="text-blue-700 underline-offset-2 hover:underline"
                            >
                              보기
                            </Link>
                            {data.canLink ? (
                              <button
                                type="button"
                                className={`${portalBtnPrimary} ml-auto py-0.5 text-[11px]`}
                                disabled={!!busyKey}
                                onClick={() =>
                                  void merge({
                                    letter: row,
                                    targetEntryId: target.entryId,
                                    targetName: target.companyName,
                                    targetCode: target.externalCode,
                                    key,
                                  })
                                }
                              >
                                {busyKey === key ? '연결 중…' : '이 업체에 연결'}
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>

                    {data.canLink ? (
                      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                        <input
                          className={`${portalInput} py-1 text-xs`}
                          placeholder="원장 상호·코드 필터"
                          value={pickQ}
                          onChange={e => setPickQ(e.target.value)}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className={`${portalInput} max-w-full flex-1 py-1 text-xs`}
                            value={pickId}
                            onChange={e =>
                              setManualById(prev => ({
                                ...prev,
                                [row.entryId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">코드 있는 업체에서 고르기…</option>
                            {pickFiltered.map(p => (
                              <option key={p.entryId} value={p.entryId}>
                                {p.companyName} ({p.externalCode}) · {formatArrearsWon(p.balance)}
                                {p.managerName ? ` · ${p.managerName}` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={portalBtnSecondary}
                            disabled={!pickId || !!busyKey}
                            onClick={() => {
                              const ent = data.pickEntries.find(p => p.entryId === pickId);
                              if (!ent) return;
                              void merge({
                                letter: row,
                                targetEntryId: ent.entryId,
                                targetName: ent.companyName,
                                targetCode: ent.externalCode,
                                key: `M:${row.entryId}:${ent.entryId}`,
                              });
                            }}
                          >
                            선택 연결
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : loading ? (
          <p className="py-4 text-center text-sm text-slate-500">불러오는 중…</p>
        ) : data ? (
          <p className="py-4 text-center text-sm text-slate-500">연결할 공문 전용 행이 없습니다.</p>
        ) : null}
      </div>
    </div>
  );
}
