'use client';

import { useMemo, useState } from 'react';
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
  match: 'auto' | 'manual' | 'needs_link' | 'skip';
  linkedLedgerCode: string;
  linkedLedgerName: string;
  balanceMismatch: boolean;
  suggestions: Suggestion[];
};

type PickEntry = {
  externalCode: string;
  companyName: string;
  balance: number;
  businessNo: string;
};

type ReviewPayload = {
  mode: 'restart';
  ledgerFilename: string;
  autoMatched: LetterRow[];
  needsLink: LetterRow[];
  skipped: LetterRow[];
  ledgerOnly: PickEntry[];
  pickEntries: PickEntry[];
  letterCount: number;
  ledgerCount: number;
  canLink: boolean;
  canApply: boolean;
};

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}%`;
}

type Props = {
  onLinked?: () => void;
};

export default function ArrearsMatchPanel({ onLinked }: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'need' | 'auto' | 'ledger'>('need');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [manualBySoft, setManualBySoft] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');

  const scan = async () => {
    if (!ledgerFile) {
      setError('거래처원장 엑셀을 선택해 주세요.');
      return;
    }
    setLoading(true);
    setError('');
    setMsg('');
    try {
      const form = new FormData();
      form.append('file', ledgerFile);
      const res = await fetch('/api/arrears/restart-match', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '대조 실패');
      setData(json as ReviewPayload);
      setTab('need');
      setMsg(
        `공문 ${(json as ReviewPayload).letterCount} · 원장 ${(json as ReviewPayload).ledgerCount} · 연결필요 ${(json as ReviewPayload).needsLink.length}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '대조 실패');
    } finally {
      setLoading(false);
    }
  };

  const saveLink = async (opts: {
    row: LetterRow;
    ledgerExternalCode: string;
    ledgerCompanyName: string;
    status: 'manual' | 'skip';
    key: string;
  }) => {
    if (!data?.canLink) return;
    if (opts.status === 'manual') {
      if (
        !window.confirm(
          `공문 «${opts.row.companyName}» → 원장 «${opts.ledgerCompanyName}» (${opts.ledgerExternalCode}) 연결할까요?\n(지금은 연결만 저장하고, 원장 반영 버튼에서 실제로 붙입니다.)`,
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(`공문 «${opts.row.companyName}» 를 원장에서 제외(미반영)할까요?`)
    ) {
      return;
    }

    setBusyKey(opts.key);
    setError('');
    try {
      const res = await fetch('/api/arrears/link-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letterCompanyName: opts.row.companyName,
          letterSoftKey: opts.row.letterSoftKey,
          managerName: opts.row.managerName,
          ledgerExternalCode: opts.ledgerExternalCode,
          ledgerCompanyName: opts.ledgerCompanyName,
          status: opts.status,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '연결 저장 실패');

      setData(prev => {
        if (!prev) return prev;
        const nextNeed = prev.needsLink.filter(r => r.letterSoftKey !== opts.row.letterSoftKey);
        const updated: LetterRow = {
          ...opts.row,
          match: opts.status === 'skip' ? 'skip' : 'manual',
          linkedLedgerCode: opts.status === 'skip' ? '' : opts.ledgerExternalCode,
          linkedLedgerName: opts.status === 'skip' ? '' : opts.ledgerCompanyName,
        };
        const nextAuto = [
          ...prev.autoMatched.filter(r => r.letterSoftKey !== opts.row.letterSoftKey),
          ...(opts.status === 'manual' ? [updated] : []),
        ];
        const nextSkip = [
          ...prev.skipped.filter(r => r.letterSoftKey !== opts.row.letterSoftKey),
          ...(opts.status === 'skip' ? [updated] : []),
        ];
        return { ...prev, needsLink: nextNeed, autoMatched: nextAuto, skipped: nextSkip };
      });
      onLinked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 저장 실패');
    } finally {
      setBusyKey('');
    }
  };

  const applyLedger = async () => {
    if (!ledgerFile || !data?.canApply) return;
    if (data.needsLink.length > 0) {
      if (
        !window.confirm(
          `아직 연결 필요 ${data.needsLink.length}건이 있습니다.\n연결 안 한 공문은 원장 반영 시 제외(삭제)됩니다. 계속할까요?`,
        )
      ) {
        return;
      }
    } else if (!window.confirm('원장을 DB에 반영하고, 연결된 공문 상세를 붙일까요?')) {
      return;
    }

    setApplying(true);
    setError('');
    setMsg('');
    try {
      const form = new FormData();
      form.append('file', ledgerFile);
      const res = await fetch('/api/arrears/apply-ledger-links', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || '원장 반영 실패');
      setMsg(
        `원장 반영 완료 · 부착 ${(json as { attached?: number }).attached ?? 0} · 제외 ${(json as { skipped?: number }).skipped ?? 0} · 신규 ${(json as { ledgerInserted?: number }).ledgerInserted ?? 0}`,
      );
      setData(null);
      onLinked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '원장 반영 실패');
    } finally {
      setApplying(false);
    }
  };

  const list = useMemo(() => {
    if (!data) return [] as LetterRow[];
    const qq = q.trim().toLowerCase();
    let rows =
      tab === 'need' ? data.needsLink : tab === 'auto' ? data.autoMatched : ([] as LetterRow[]);
    if (!qq) return rows;
    return rows.filter(
      r =>
        r.companyName.toLowerCase().includes(qq) ||
        r.managerName.toLowerCase().includes(qq) ||
        r.linkedLedgerName.toLowerCase().includes(qq),
    );
  }, [data, tab, q]);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <p className="text-sm font-semibold text-violet-950">공문 ↔ 원장 이름 맞추기 (재시작)</p>
          <p className="text-[11px] text-violet-800/80">
            공문은 CLI로 넣은 뒤, 여기서 원장 xls를 올려 없는 이름만 연결하고 마지막에 원장 반영.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-violet-700">
          {open ? '접기' : '펼치기'}
          {data ? ` · 연결필요 ${data.needsLink.length}` : ''}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-violet-100 px-3 py-3">
          <ol className="list-decimal pl-4 text-[11px] text-slate-600 space-y-0.5">
            <li>
              로컬: <code className="rounded bg-slate-100 px-1">npx tsx scripts/reset-arrears-from-letters.ts</code>
            </li>
            <li>아래 원장 파일 선택 → 대조 → «연결 필요»만 수동 연결</li>
            <li>«원장 반영» 또는 CLI apply-arrears-ledger-with-links.ts</li>
          </ol>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-100 bg-white p-2.5">
            <input
              type="file"
              accept=".xls,.xlsx"
              className="text-xs max-w-full"
              onChange={e => setLedgerFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className={portalBtnPrimary}
              disabled={loading || !ledgerFile}
              onClick={() => void scan()}
            >
              {loading ? '대조 중…' : '원장 대조'}
            </button>
            {data?.canApply ? (
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={applying || !ledgerFile}
                onClick={() => void applyLedger()}
              >
                {applying ? '반영 중…' : '원장 반영 (확정)'}
              </button>
            ) : null}
          </div>

          {msg ? <p className="text-xs text-emerald-800">{msg}</p> : null}
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}

          {data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${tab === 'need' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
                  onClick={() => setTab('need')}
                >
                  연결 필요 ({data.needsLink.length})
                </button>
                <button
                  type="button"
                  className={`${tab === 'auto' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
                  onClick={() => setTab('auto')}
                >
                  자동·수동 연결됨 ({data.autoMatched.length})
                </button>
                <button
                  type="button"
                  className={`${tab === 'ledger' ? portalBtnPrimary : portalBtnSecondary} py-1.5 text-xs`}
                  onClick={() => setTab('ledger')}
                >
                  원장만 ({data.ledgerOnly.length})
                </button>
              </div>

              {tab !== 'ledger' ? (
                <input
                  className={`${portalInput} py-1.5 text-xs`}
                  placeholder="상호·담당 검색"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              ) : null}

              {!data.canLink ? (
                <p className="text-[11px] text-slate-500">연결·원장 반영은 찰리만 가능합니다.</p>
              ) : null}

              {tab === 'ledger' ? (
                <div className="max-h-72 overflow-auto rounded border border-slate-200 bg-white text-xs">
                  <table className="min-w-full">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="px-2 py-1.5 text-left">코드</th>
                        <th className="px-2 py-1.5 text-left">상호</th>
                        <th className="px-2 py-1.5 text-right">잔액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.ledgerOnly.slice(0, 200).map(r => (
                        <tr key={r.externalCode}>
                          <td className="px-2 py-1 font-mono text-[10px]">{r.externalCode}</td>
                          <td className="px-2 py-1">{r.companyName}</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {formatArrearsWon(r.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.ledgerOnly.length > 200 ? (
                    <p className="px-2 py-1 text-[10px] text-slate-400">상위 200건만 표시</p>
                  ) : null}
                </div>
              ) : (
                <div className="max-h-[32rem] space-y-3 overflow-auto">
                  {list.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">목록이 비어 있습니다.</p>
                  ) : (
                    list.map(row => {
                      const pick = manualBySoft[row.letterSoftKey] || '';
                      return (
                        <div
                          key={row.entryId}
                          className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{row.companyName}</p>
                              <p className="text-slate-500">
                                {row.managerName} · 줄 {row.lineCount}
                                {row.letterDate ? ` · ${row.letterDate}` : ''}
                                {row.match !== 'needs_link' ? (
                                  <span className="ml-1 text-emerald-800">
                                    → {row.linkedLedgerName} ({row.linkedLedgerCode}) · {row.match}
                                  </span>
                                ) : (
                                  <span className="ml-1 font-medium text-rose-800">원장 동일명 없음</span>
                                )}
                              </p>
                            </div>
                            <p className="tabular-nums font-semibold text-rose-800">
                              공문 {formatArrearsWon(row.letterBalance)}
                            </p>
                          </div>

                          {row.match === 'needs_link' && data.canLink ? (
                            <>
                              <ul className="mt-2 space-y-1.5">
                                {row.suggestions.map(s => (
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
                                    <button
                                      type="button"
                                      className={`${portalBtnPrimary} ml-auto py-0.5 text-[11px]`}
                                      disabled={!!busyKey}
                                      onClick={() =>
                                        void saveLink({
                                          row,
                                          ledgerExternalCode: s.externalCode,
                                          ledgerCompanyName: s.companyName,
                                          status: 'manual',
                                          key: `${row.letterSoftKey}:${s.externalCode}`,
                                        })
                                      }
                                    >
                                      이 원장에 연결
                                    </button>
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                                <select
                                  className={`${portalInput} max-w-full flex-1 py-1 text-xs`}
                                  value={pick}
                                  onChange={e =>
                                    setManualBySoft(prev => ({
                                      ...prev,
                                      [row.letterSoftKey]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">원장 전체에서 고르기…</option>
                                  {data.pickEntries.map(p => (
                                    <option key={p.externalCode} value={p.externalCode}>
                                      {p.companyName} ({p.externalCode}) ·{' '}
                                      {formatArrearsWon(p.balance)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className={portalBtnSecondary}
                                  disabled={!pick || !!busyKey}
                                  onClick={() => {
                                    const ent = data.pickEntries.find(p => p.externalCode === pick);
                                    if (!ent) return;
                                    void saveLink({
                                      row,
                                      ledgerExternalCode: ent.externalCode,
                                      ledgerCompanyName: ent.companyName,
                                      status: 'manual',
                                      key: `M:${row.letterSoftKey}:${pick}`,
                                    });
                                  }}
                                >
                                  선택 연결
                                </button>
                                <button
                                  type="button"
                                  className={portalBtnSecondary}
                                  disabled={!!busyKey}
                                  onClick={() =>
                                    void saveLink({
                                      row,
                                      ledgerExternalCode: '',
                                      ledgerCompanyName: '',
                                      status: 'skip',
                                      key: `S:${row.letterSoftKey}`,
                                    })
                                  }
                                >
                                  제외
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
