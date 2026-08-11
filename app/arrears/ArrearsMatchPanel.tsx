'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

type LetterLine = {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
};

type LetterRow = {
  sheetName: string;
  filename: string;
  managerName: string;
  lineCount: number;
  letterBalance: number;
  letterDate: string;
  sheetKey?: string;
  lines?: LetterLine[];
  sameNameEntry: SuggestionEntry | null;
  balanceMismatch: boolean;
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

type PickEntry = {
  entryId: string;
  companyName: string;
  externalCode: string;
  balance: number;
  managerName: string;
  ledgerRefOnly: boolean;
};

type ReviewPayload = {
  letterDir: string;
  letterDirOk: boolean;
  source?: 'upload' | 'disk' | 'none';
  sourceLabel?: string;
  letterSheets: LetterRow[];
  unmatchedLetters: LetterRow[];
  ledgerOnly: LedgerOnly[];
  pickEntries: PickEntry[];
  letterSheetCount: number;
  sameNameCount: number;
  canLink: boolean;
  uploadedFiles?: string[];
};

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}%`;
}

function sheetKeyOf(row: LetterRow) {
  return row.sheetKey || `${row.sheetName}|||${row.filename}`;
}

type Props = {
  onLinked?: () => void;
};

export default function ArrearsMatchPanel({ onLinked }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'need' | 'same' | 'all' | 'ledger'>('need');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [manualEntryBySheet, setManualEntryBySheet] = useState<Record<string, string>>({});
  const [manualSheetByEntry, setManualSheetByEntry] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);

  const applyPayload = (json: ReviewPayload) => {
    if (!json.letterSheets) json.letterSheets = json.unmatchedLetters || [];
    if (!json.pickEntries) json.pickEntries = [];
    setData(json);
  };

  const loadDisk = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/match-review', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '매칭 검토 실패');
      applyPayload(json as ReviewPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : '매칭 검토 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadScan = async () => {
    if (!uploadFiles?.length) {
      setError('공문 엑셀 파일을 선택해 주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      for (const f of Array.from(uploadFiles)) form.append('files', f);
      const res = await fetch('/api/arrears/match-review', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '업로드 스캔 실패');
      applyPayload(json as ReviewPayload);
      setTab('need');
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 스캔 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !data && !loading) void loadDisk();
  }, [open, data, loading, loadDisk]);

  const findLetterRow = (sheetName: string, filename: string) =>
    data?.letterSheets.find(r => r.sheetName === sheetName && r.filename === filename);

  const link = async (opts: {
    entryId: string;
    sheetName: string;
    filename: string;
    key: string;
    entryName: string;
  }) => {
    if (!data?.canLink) return;
    const letter = findLetterRow(opts.sheetName, opts.filename);
    if (
      !window.confirm(
        `공문 «${opts.sheetName}» → 원장 «${opts.entryName}» 에 연결할까요?\n` +
          `공문 상세를 그 행에 넣고, 잔액은 거래처원장 잔액으로 맞춥니다.\n` +
          `연결되면 포털에서 사유를 볼 수 있어 Z: 를 다시 열 필요는 없습니다.`,
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
          sheet: letter
            ? {
                companyName: letter.sheetName,
                letterDate: letter.letterDate,
                lines: letter.lines || [],
              }
            : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '연결 실패');
      // 업로드 목록은 유지 — 원장만 탭/픽 목록은 soft reload 없이 onLinked
      onLinked?.();
      // 연결한 시트는 목록에서 빼서 진행감 표시
      setData(prev => {
        if (!prev) return prev;
        const nextSheets = prev.letterSheets.filter(
          r => !(r.sheetName === opts.sheetName && r.filename === opts.filename),
        );
        return {
          ...prev,
          letterSheets: nextSheets,
          unmatchedLetters: nextSheets.filter(r => !r.sameNameEntry),
          letterSheetCount: nextSheets.length,
          sameNameCount: nextSheets.filter(r => !!r.sameNameEntry).length,
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusyKey('');
    }
  };

  const needCount = data?.letterSheets.filter(r => !r.sameNameEntry).length ?? 0;
  const sameCount = data?.letterSheets.filter(r => !!r.sameNameEntry).length ?? 0;
  const mismatchCount = data?.letterSheets.filter(r => r.balanceMismatch).length ?? 0;

  const filteredLetters = useMemo(() => {
    if (!data) return [];
    const qq = q.trim().toLowerCase();
    let list = data.letterSheets;
    if (tab === 'need') list = list.filter(r => !r.sameNameEntry);
    if (tab === 'same') list = list.filter(r => !!r.sameNameEntry);
    if (!qq) return list;
    return list.filter(
      r =>
        r.sheetName.toLowerCase().includes(qq) ||
        r.filename.toLowerCase().includes(qq) ||
        r.managerName.toLowerCase().includes(qq) ||
        (r.sameNameEntry?.companyName || '').toLowerCase().includes(qq),
    );
  }, [data, tab, q]);

  const pickList = data?.pickEntries ?? [];
  const needsUpload = !data?.letterSheets?.length || data.source === 'none';

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
            배포 사이트에서는 공문 xls를 올린 뒤, 원장 행을 직접 연결하세요. 잔액은 원장 기준.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-violet-700">
          {open ? '접기' : '펼치기'}
          {data?.letterSheetCount
            ? ` · 공문 ${data.letterSheetCount} · 연결필요 ${needCount}`
            : ''}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-violet-100 px-3 py-3">
          <div className="rounded-lg border border-violet-100 bg-white p-2.5 space-y-2">
            <p className="text-xs font-semibold text-slate-800">1) 공문 엑셀 올리기</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Vercel에는 Z: 드라이브가 없습니다. 담당자별 «미수수수료-○○.xls» 를 선택해 올리세요.
              연결이 끝나면 내역은 DB에 남아서, 이후에는 포털 미수 상세만 보면 됩니다.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple
                className="text-xs max-w-full"
                onChange={e => setUploadFiles(e.target.files)}
              />
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={loading || !uploadFiles?.length}
                onClick={() => void uploadScan()}
              >
                {loading ? '스캔 중…' : '업로드·스캔'}
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={loading}
                onClick={() => void loadDisk()}
                title="로컬 개발 PC에서 Z: 가 있을 때만"
              >
                디스크 다시 시도
              </button>
            </div>
            {data?.source === 'upload' && data.sourceLabel ? (
              <p className="text-[11px] text-emerald-800">스캔됨: {data.sourceLabel}</p>
            ) : null}
          </div>

          {needsUpload && data?.source !== 'upload' ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              공문 목록이 비어 있습니다. 위쪽에서 공문 xls를 올려 주세요.
              {data?.letterDir ? ` (서버 경로 ${data.letterDir} 는 배포 환경에서 없음)` : ''}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`${tab === 'need' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
              onClick={() => setTab('need')}
            >
              연결 필요 ({needCount})
            </button>
            <button
              type="button"
              className={`${tab === 'same' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
              onClick={() => setTab('same')}
            >
              이름 같음·확인 ({sameCount})
              {mismatchCount ? ` · 잔액틀림 ${mismatchCount}` : ''}
            </button>
            <button
              type="button"
              className={`${tab === 'all' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
              onClick={() => setTab('all')}
            >
              공문 전체
            </button>
            <button
              type="button"
              className={`${tab === 'ledger' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
              onClick={() => setTab('ledger')}
            >
              원장만 ({data?.ledgerOnly.length ?? 0})
            </button>
          </div>

          {tab !== 'ledger' ? (
            <input
              className={`${portalInput} py-1.5 text-xs`}
              placeholder="공문 상호·담당·파일 검색"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          ) : null}

          {!data?.canLink ? (
            <p className="text-[11px] text-slate-500">연결 버튼은 찰리 계정에서만 보입니다.</p>
          ) : null}

          {error ? <p className="text-xs text-rose-700">{error}</p> : null}

          {loading && !data?.letterSheets.length ? (
            <p className="py-6 text-center text-sm text-slate-500">스캔 중…</p>
          ) : null}

          {tab !== 'ledger' && data ? (
            <div className="max-h-[32rem] space-y-3 overflow-auto">
              {filteredLetters.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  {data.letterSheetCount === 0
                    ? '먼저 공문 엑셀을 업로드하세요.'
                    : '표시할 공문 시트가 없습니다.'}
                </p>
              ) : (
                filteredLetters.map(row => {
                  const sheetKey = sheetKeyOf(row);
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
                          {row.sameNameEntry ? (
                            <p className="mt-1 text-[11px] text-slate-600">
                              참고: 원장에 같은 이름 «{row.sameNameEntry.companyName}»
                              {row.balanceMismatch ? (
                                <span className="ml-1 font-semibold text-amber-800">
                                  · 잔액 불일치 (공문 {formatArrearsWon(row.letterBalance)} / 원장{' '}
                                  {formatArrearsWon(row.sameNameEntry.balance)})
                                </span>
                              ) : (
                                <span className="ml-1 text-slate-500">
                                  · 잔액 같음 {formatArrearsWon(row.sameNameEntry.balance)}
                                </span>
                              )}
                              — 그래도 직접 연결해야 합니다.
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] font-medium text-rose-800">
                              동일 이름 원장 없음 · 아래에서 고르세요
                            </p>
                          )}
                        </div>
                        <p className="tabular-nums font-semibold text-rose-800">
                          공문 {formatArrearsWon(row.letterBalance)}
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
                              {s.managerName} · 원장 {formatArrearsWon(s.balance)}
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
                                    entryName: s.companyName,
                                  })
                                }
                              >
                                {busyKey === `L:${sheetKey}:${s.entryId}` ? '연결 중…' : '이 행에 연결'}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {data.canLink && pickList.length > 0 ? (
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
                            <option value="">원장 업체 직접 고르기 (전체)…</option>
                            {pickList.map(e => (
                              <option key={e.entryId} value={e.entryId}>
                                {e.companyName} ({e.externalCode}) · {formatArrearsWon(e.balance)}
                                {e.ledgerRefOnly ? ' · 원장반영' : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={portalBtnSecondary}
                            disabled={!manualId || !!busyKey}
                            onClick={() => {
                              const ent = pickList.find(e => e.entryId === manualId);
                              if (!ent) return;
                              void link({
                                entryId: manualId,
                                sheetName: row.sheetName,
                                filename: row.filename,
                                key: `M:${sheetKey}:${manualId}`,
                                entryName: ent.companyName,
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

          {tab === 'ledger' && data ? (
            <div className="max-h-[32rem] space-y-3 overflow-auto">
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
                          원장 {formatArrearsWon(row.balance)}
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
                              {data.canLink && data.letterSheets.length > 0 ? (
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
                                      entryName: row.companyName,
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

                      {data.canLink && data.letterSheets.length > 0 ? (
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
                            <option value="">공문 시트 직접 고르기…</option>
                            {data.letterSheets.map(l => (
                              <option key={sheetKeyOf(l)} value={sheetKeyOf(l)}>
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
                                entryName: row.companyName,
                              });
                            }}
                          >
                            선택 연결
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-amber-800">
                          공문을 먼저 업로드해야 원장 쪽에 붙일 시트가 생깁니다.
                        </p>
                      )}
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
