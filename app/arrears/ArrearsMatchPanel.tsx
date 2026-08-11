'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
} from '@/app/components/portal/uiClasses';
import { formatArrearsWon } from '@/app/types/arrears';

type SuggestionEntry = {
  entryId: string;
  companyName: string;
  externalCode: string;
  balance: number;
  managerName: string;
  score: number;
  ledgerRefOnly: boolean;
};

type UnmatchedLetter = {
  sheetName: string;
  filename: string;
  managerName: string;
  lineCount: number;
  letterBalance: number;
  letterDate: string;
  suggestions: SuggestionEntry[];
};

type LedgerOnly = {
  entryId: string;
  companyName: string;
  externalCode: string;
  balance: number;
  managerName: string;
  lineCount: number;
  lastDesc: string;
  suggestions: Array<{
    sheetName: string;
    filename: string;
    managerName: string;
    score: number;
    lineCount: number;
  }>;
};

type ReviewPayload = {
  letterDir: string;
  letterDirOk: boolean;
  unmatchedLetters: UnmatchedLetter[];
  ledgerOnly: LedgerOnly[];
  letterSheetCount: number;
  matchedLetterCount: number;
  canLink: boolean;
};

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}%`;
}

type Props = {
  onLinked?: () => void;
};

export default function ArrearsMatchPanel({ onLinked }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'letter' | 'ledger'>('letter');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [manualEntryBySheet, setManualEntryBySheet] = useState<Record<string, string>>({});
  const [manualSheetByEntry, setManualSheetByEntry] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/match-review', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '매칭 검토 실패');
      setData(json as ReviewPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : '매칭 검토 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data && !loading) void load();
  }, [open, data, loading, load]);

  const link = async (opts: { entryId: string; sheetName: string; filename: string; key: string }) => {
    if (!data?.canLink) return;
    if (
      !window.confirm(
        `공문 «${opts.sheetName}» 상세를 미수 행에 연결할까요?\n(기존 원장반영 단독 줄은 공문 상세로 바뀌고, 원장 잔액 차액은 유지됩니다.)`,
      )
    ) {
      return;
    }
    setBusyKey(opts.key);
    setError('');
    try {
      const res = await fetch('/api/arrears/link-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: opts.entryId,
          sheetName: opts.sheetName,
          filename: opts.filename,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '연결 실패');
      await load();
      onLinked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusyKey('');
    }
  };

  const letterOptions =
    data?.unmatchedLetters.map(l => `${l.sheetName}|||${l.filename}`) ?? [];

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <p className="text-sm font-semibold text-violet-950">공문 ↔ 원장 이름 맞추기</p>
          <p className="text-[11px] text-violet-800/80">
            공문에만 있거나 원장반영만 있는 업체를 유사명으로 묶고, 찰리가 연결합니다.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-violet-700">
          {open ? '접기' : '펼치기'}
          {data
            ? ` · 공문미연결 ${data.unmatchedLetters.length} · 원장단독 ${data.ledgerOnly.length}`
            : ''}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-violet-100 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${tab === 'letter' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
              onClick={() => setTab('letter')}
            >
              공문에만 있음
              {data ? ` (${data.unmatchedLetters.length})` : ''}
            </button>
            <button
              type="button"
              className={`${tab === 'ledger' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
              onClick={() => setTab('ledger')}
            >
              원장반영만
              {data ? ` (${data.ledgerOnly.length})` : ''}
            </button>
            <button
              type="button"
              className={`${portalBtnSecondary} ml-auto py-1.5 text-xs`}
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? '조회 중…' : '다시 스캔'}
            </button>
          </div>

          {data && !data.letterDirOk ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              공문 폴더에 접근할 수 없습니다 ({data.letterDir}). 로컬에서 Z: 드라이브가 보이거나
              ARREARS_LETTER_DIR 을 설정한 환경에서만 «공문에만» 목록·연결이 됩니다. «원장반영만»은
              DB 기준으로 표시됩니다.
            </p>
          ) : null}

          {data?.letterDirOk ? (
            <p className="text-[11px] text-slate-500">
              공문 시트 {data.letterSheetCount} · 자동매칭 {data.matchedLetterCount} ·{' '}
              {data.letterDir}
            </p>
          ) : null}

          {!data?.canLink ? (
            <p className="text-[11px] text-slate-500">연결(반영) 버튼은 찰리 계정에서만 보입니다.</p>
          ) : null}

          {error ? <p className="text-xs text-rose-700">{error}</p> : null}

          {loading && !data ? (
            <p className="py-6 text-center text-sm text-slate-500">스캔 중…</p>
          ) : null}

          {tab === 'letter' && data ? (
            <div className="max-h-[28rem] space-y-3 overflow-auto">
              {data.unmatchedLetters.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  공문 시트가 모두 원장 상호와 맞춰졌거나, 폴더를 읽을 수 없습니다.
                </p>
              ) : (
                data.unmatchedLetters.map(row => {
                  const sheetKey = `${row.sheetName}|||${row.filename}`;
                  const manualId = manualEntryBySheet[sheetKey] || '';
                  return (
                    <div
                      key={sheetKey}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{row.sheetName}</p>
                          <p className="text-slate-500">
                            {row.managerName} · {row.filename} · 줄 {row.lineCount}
                            {row.letterDate ? ` · ${row.letterDate}` : ''}
                          </p>
                        </div>
                        <p className="tabular-nums font-semibold text-rose-800">
                          공문잔액 {formatArrearsWon(row.letterBalance)}
                        </p>
                      </div>

                      <ul className="mt-2 space-y-1.5">
                        {row.suggestions.map(s => (
                          <li
                            key={s.entryId}
                            className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5"
                          >
                            <span className="font-medium text-slate-800">
                              {s.companyName}
                              <span className="ml-1 font-mono text-[10px] text-slate-400">
                                {s.externalCode}
                              </span>
                            </span>
                            <span className="text-slate-500">
                              {s.managerName} · {formatArrearsWon(s.balance)}
                            </span>
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-900">
                              유사 {scoreLabel(s.score)}
                            </span>
                            {s.ledgerRefOnly ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                                원장반영
                              </span>
                            ) : null}
                            <Link
                              href={`/arrears/${s.entryId}`}
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
                                  void link({
                                    entryId: s.entryId,
                                    sheetName: row.sheetName,
                                    filename: row.filename,
                                    key: `L:${sheetKey}:${s.entryId}`,
                                  })
                                }
                              >
                                {busyKey === `L:${sheetKey}:${s.entryId}` ? '연결 중…' : '이 행에 연결'}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {data.canLink && data.ledgerOnly.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                          <select
                            className={`${portalInput} max-w-full flex-1 py-1 text-xs`}
                            value={manualId}
                            onChange={e =>
                              setManualEntryBySheet(prev => ({
                                ...prev,
                                [sheetKey]: e.target.value,
                              }))
                            }
                          >
                            <option value="">원장반영만 목록에서 직접 고르기…</option>
                            {data.ledgerOnly.map(e => (
                              <option key={e.entryId} value={e.entryId}>
                                {e.companyName} ({e.externalCode}) · {formatArrearsWon(e.balance)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={portalBtnSecondary}
                            disabled={!manualId || !!busyKey}
                            onClick={() =>
                              void link({
                                entryId: manualId,
                                sheetName: row.sheetName,
                                filename: row.filename,
                                key: `M:${sheetKey}:${manualId}`,
                              })
                            }
                          >
                            선택 연결
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          {tab === 'ledger' && data ? (
            <div className="max-h-[28rem] space-y-3 overflow-auto">
              {data.ledgerOnly.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  원장반영만 있는 업체가 없습니다.
                </p>
              ) : (
                data.ledgerOnly.map(row => {
                  const pick = manualSheetByEntry[row.entryId] || '';
                  return (
                    <div
                      key={row.entryId}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <Link
                            href={`/arrears/${row.entryId}`}
                            className="text-sm font-semibold text-blue-800 underline-offset-2 hover:underline"
                          >
                            {row.companyName}
                          </Link>
                          <p className="text-slate-500">
                            {row.externalCode} · {row.managerName} · 줄 {row.lineCount}
                            {row.lastDesc ? ` · ${row.lastDesc}` : ''}
                          </p>
                        </div>
                        <p className="tabular-nums font-semibold text-rose-800">
                          {formatArrearsWon(row.balance)}
                        </p>
                      </div>

                      <ul className="mt-2 space-y-1.5">
                        {row.suggestions.map(s => {
                          const key = `G:${row.entryId}:${s.sheetName}:${s.filename}`;
                          return (
                            <li
                              key={`${s.sheetName}-${s.filename}`}
                              className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5"
                            >
                              <span className="font-medium text-slate-800">{s.sheetName}</span>
                              <span className="text-slate-500">
                                {s.managerName} · 줄 {s.lineCount}
                              </span>
                              <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-900">
                                유사 {scoreLabel(s.score)}
                              </span>
                              {data.canLink ? (
                                <button
                                  type="button"
                                  className={`${portalBtnPrimary} ml-auto py-0.5 text-[11px]`}
                                  disabled={!!busyKey}
                                  onClick={() =>
                                    void link({
                                      entryId: row.entryId,
                                      sheetName: s.sheetName,
                                      filename: s.filename,
                                      key,
                                    })
                                  }
                                >
                                  {busyKey === key ? '연결 중…' : '이 공문 연결'}
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>

                      {data.canLink && letterOptions.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                          <select
                            className={`${portalInput} max-w-full flex-1 py-1 text-xs`}
                            value={pick}
                            onChange={e =>
                              setManualSheetByEntry(prev => ({
                                ...prev,
                                [row.entryId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">공문 미연결 시트에서 직접 고르기…</option>
                            {data.unmatchedLetters.map(l => (
                              <option
                                key={`${l.sheetName}|||${l.filename}`}
                                value={`${l.sheetName}|||${l.filename}`}
                              >
                                {l.sheetName} ({l.managerName}) · {l.filename}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={portalBtnSecondary}
                            disabled={!pick || !!busyKey}
                            onClick={() => {
                              const [sheetName, filename] = pick.split('|||');
                              if (!sheetName || !filename) return;
                              void link({
                                entryId: row.entryId,
                                sheetName,
                                filename,
                                key: `N:${row.entryId}:${pick}`,
                              });
                            }}
                          >
                            선택 연결
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
