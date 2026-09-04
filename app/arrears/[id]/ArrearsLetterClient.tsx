'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalMain,
} from '@/app/components/portal/uiClasses';
import ArrearsManualEntryModal, {
  type ManualChannel,
} from '@/app/arrears/ArrearsManualEntryModal';
import {
  formatArrearsLetterDate,
  formatArrearsPaidDateKo,
  formatArrearsWon,
  hasPriorClosedLetterCycle,
  letterRunningBalances,
  linesForCurrentLetterCycle,
  resolveArrearsLetterAsOfDate,
  todayArrearsPaidDateKo,
  type ArrearsEntryDto,
  type ArrearsLetterLineDto,
  type ArrearsLetterLineInput,
} from '@/app/types/arrears';
import { formatArrearsChargeLabel } from '@/lib/arrearsLineLabel';
import { fmt } from '@/app/lib/taxAmountFmt';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';

const BANK_LINE = '부산은행 113-2016-5229-07 세무법인 청년들';
const ADDR_LINE = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호';
const TEL_LINE = 'TEL : 051-783-6007 / FAX : 051-784-6007';

type EditLine = {
  key: string;
  description: string;
  amount: string;
  paidAmount: string;
  paidDate: string;
  source: ArrearsLetterLineDto['source'];
};

function linePortalDescription(
  l: ArrearsLetterLineDto,
  ctx: { asOfDate?: string | null; prevDescription?: string | null },
): string {
  // 엑셀 공문(source=letter)은 원문 그대로 — 전기이월·연도 추론 라벨 변환 금지
  if (l.source === 'letter') return l.description;
  return formatArrearsChargeLabel(l.description, ctx) || l.description;
}

function toEditLines(lines: ArrearsLetterLineDto[], asOf?: string | null): EditLine[] {
  return lines.map((l, i) => ({
    key: l.id || `n-${i}`,
    description:
      l.source === 'letter'
        ? l.description
        : linePortalDescription(l, {
            asOfDate: asOf,
            prevDescription: i > 0 ? lines[i - 1]?.description : undefined,
          }),
    amount: l.amount ? formatArrearsWon(l.amount) : '',
    paidAmount: l.paidAmount ? formatArrearsWon(l.paidAmount) : '',
    paidDate: formatArrearsPaidDateKo(l.paidDate) || l.paidDate || '',
    source: l.source,
  }));
}

function parseWon(s: string): number {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export default function ArrearsLetterClient({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [item, setItem] = useState<ArrearsEntryDto | null>(null);
  const [lines, setLines] = useState<ArrearsLetterLineDto[]>([]);
  const [letterBalance, setLetterBalance] = useState(0);
  const [balanceDiff, setBalanceDiff] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(() => searchParams.get('edit') === '1');
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [letterDate, setLetterDate] = useState('');
  const [letterAsOfRaw, setLetterAsOfRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualChannel, setManualChannel] = useState<ManualChannel>('thebill');
  const [manualBusy, setManualBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** false=전체 내역(기본), true=0원 청산 이전 구간 숨김(조회·인쇄) */
  const [excludePriorZero, setExcludePriorZero] = useState(false);
  /** 연결필요(letter:) → 원장 거래처 연결 */
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const [linkPickId, setLinkPickId] = useState('');
  const [linkPickQ, setLinkPickQ] = useState('');
  const [linkSuggestions, setLinkSuggestions] = useState<
    Array<{ entryId: string; externalCode: string; companyName: string; balance: number; score: number }>
  >([]);
  const [linkPickEntries, setLinkPickEntries] = useState<
    Array<{ entryId: string; externalCode: string; companyName: string; balance: number; managerName: string }>
  >([]);
  const [linkLoaded, setLinkLoaded] = useState(false);

  const needsLedgerLink = !!item?.externalCode.startsWith('letter:');

  const load = useCallback(async () => {
    const res = await fetchWithTimeout(`/api/arrears/${id}`, { cache: 'no-store' }, 20_000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '조회 실패');
    const it = (data as { item: ArrearsEntryDto }).item;
    const ls = (data as { lines: ArrearsLetterLineDto[] }).lines || [];
    setItem(it);
    setLines(ls);
    setLetterBalance((data as { letterBalance?: number }).letterBalance ?? 0);
    setBalanceDiff((data as { balanceDiff?: number }).balanceDiff ?? 0);
    setCanManage(!!(data as { canManage?: boolean }).canManage);
    const globalAsOf = (data as { globalAsOfDate?: string }).globalAsOfDate || '';
    const letterAsOf =
      (data as { letterAsOfDate?: string }).letterAsOfDate ||
      resolveArrearsLetterAsOfDate(globalAsOf, it);
    setLetterAsOfRaw(globalAsOf || it.asOfDate || '');
    setLetterDate(letterAsOf);
    const wantEdit = searchParams.get('edit') === '1';
    const allowEdit = !!(data as { canManage?: boolean }).canManage;
    if (wantEdit && allowEdit) {
      setEditLines(toEditLines(ls, globalAsOf || it.asOfDate));
      setEditing(true);
    } else if (wantEdit && !allowEdit) {
      setEditing(false);
      router.replace(`/arrears/${id}`, { scroll: false });
    }
  }, [id, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void load()
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // 조회·인쇄: 기본 전체. 「0원 이전내역 제외」면 현재 사이클만.
  // 수정 모드는 항상 전체 이력(editLines).
  const canExcludePrior = useMemo(() => hasPriorClosedLetterCycle(lines), [lines]);
  const viewLines = useMemo(() => {
    if (!excludePriorZero || !canExcludePrior) return lines;
    return linesForCurrentLetterCycle(lines);
  }, [lines, excludePriorZero, canExcludePrior]);
  const runningRaw = useMemo(() => letterRunningBalances(viewLines), [viewLines]);
  const viewLetterBalance = runningRaw.length ? runningRaw[runningRaw.length - 1]! : 0;
  /** 공문 「미수 수수료」·총액 잔액 = 미수관리 목록 잔액(현황표)과 동일 */
  const feeBalance = item != null ? Math.round(item.balance) : viewLetterBalance;
  /** 마지막 행 잔액도 목록 잔액과 맞춘다 (양수도 등으로 줄합≠현황표여도 합계는 현황표) */
  const running = useMemo(() => {
    if (!runningRaw.length) return runningRaw;
    if (Math.round(viewLetterBalance) === feeBalance) return runningRaw;
    const next = runningRaw.slice();
    next[next.length - 1] = feeBalance;
    return next;
  }, [runningRaw, viewLetterBalance, feeBalance]);
  const totalAmount = useMemo(
    () => viewLines.reduce((s, l) => s + l.amount, 0),
    [viewLines],
  );
  const totalPaid = useMemo(
    () => viewLines.reduce((s, l) => s + l.paidAmount, 0),
    [viewLines],
  );

  const startEdit = () => {
    if (!canManage) return;
    setEditLines(toEditLines(lines, letterAsOfRaw || item?.asOfDate));
    setEditing(true);
    setLinkLoaded(false);
    setLinkMsg('');
    router.replace(`/arrears/${id}?edit=1`, { scroll: false });
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditLines([]);
    setLinkLoaded(false);
    router.replace(`/arrears/${id}`, { scroll: false });
  };

  const saveEdit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: ArrearsLetterLineInput[] = editLines
        .map(l => ({
          description: l.description.trim(),
          amount: parseWon(l.amount),
          paidAmount: parseWon(l.paidAmount),
          paidDate: formatArrearsPaidDateKo(l.paidDate.trim()),
          source: l.source || 'manual',
        }))
        .filter(l => l.description || l.amount || l.paidAmount);

      const res = await fetch(`/api/arrears/${id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: payload,
          letterDate,
          syncBalance: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');

      setItem((data as { item: ArrearsEntryDto }).item);
      setLines((data as { lines: ArrearsLetterLineDto[] }).lines || []);
      setLetterBalance((data as { letterBalance?: number }).letterBalance ?? 0);
      setBalanceDiff((data as { balanceDiff?: number }).balanceDiff ?? 0);
      setEditing(false);
      setEditLines([]);
      router.replace(`/arrears/${id}`, { scroll: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const submitManual = async (payload: {
    entryId: string;
    channel: ManualChannel;
    amount: number;
    eventDate: string;
    description: string;
  }) => {
    setManualBusy(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '반영 실패');
      setItem((data as { item: ArrearsEntryDto }).item);
      setLines((data as { lines: ArrearsLetterLineDto[] }).lines || []);
      setLetterBalance((data as { letterBalance?: number }).letterBalance ?? 0);
      setBalanceDiff((data as { balanceDiff?: number }).balanceDiff ?? 0);
      setManualOpen(false);
    } catch (e) {
      throw e instanceof Error ? e : new Error('반영 실패');
    } finally {
      setManualBusy(false);
    }
  };

  const syncWithLedger = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/arrears/${id}/sync-letter`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '맞춤 실패');
      if ((data as { item?: ArrearsEntryDto }).item) {
        setItem((data as { item: ArrearsEntryDto }).item);
      }
      setLines((data as { lines: ArrearsLetterLineDto[] }).lines || []);
      setLetterBalance((data as { letterBalance?: number }).letterBalance ?? 0);
      setBalanceDiff((data as { balanceDiff?: number }).balanceDiff ?? 0);
      if (!(data as { applied?: boolean }).applied) {
        setError('관리 잔액과 내역 잔액이 이미 같습니다.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '맞춤 실패');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!editing || !needsLedgerLink || linkLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/arrears/pending-letter-links', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || '연결 목록 조회 실패');
        if (cancelled) return;
        const picks = (
          (data as {
            pickEntries?: Array<{
              entryId: string;
              externalCode: string;
              companyName: string;
              balance: number;
              managerName: string;
            }>;
          }).pickEntries ?? []
        );
        setLinkPickEntries(picks);
        const row = (
          (data as {
            needsLink?: Array<{
              entryId: string;
              suggestions: Array<{
                externalCode: string;
                companyName: string;
                balance: number;
                score: number;
              }>;
            }>;
          }).needsLink ?? []
        ).find(r => r.entryId === id);
        const sugg = (row?.suggestions ?? [])
          .map(s => {
            const target = picks.find(p => p.externalCode === s.externalCode);
            if (!target) return null;
            return {
              entryId: target.entryId,
              externalCode: s.externalCode,
              companyName: s.companyName,
              balance: s.balance,
              score: s.score,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));
        setLinkSuggestions(sugg);
        setLinkLoaded(true);
      } catch (e) {
        if (!cancelled) {
          setLinkMsg(e instanceof Error ? e.message : '연결 목록 조회 실패');
          setLinkLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, needsLedgerLink, linkLoaded, id]);

  const filteredLinkPicks = useMemo(() => {
    const qq = linkPickQ.trim().toLowerCase();
    if (!qq) return linkPickEntries;
    return linkPickEntries.filter(
      p =>
        p.companyName.toLowerCase().includes(qq) ||
        p.externalCode.toLowerCase().includes(qq),
    );
  }, [linkPickEntries, linkPickQ]);

  const mergeToLedger = async (targetEntryId: string, targetName: string, targetCode: string) => {
    if (!item) return;
    if (
      !window.confirm(
        `공문 «${item.companyName}» → 원장 «${targetName}» (${targetCode})\n` +
          `공문 상세를 옮기고 이 연결필요 행은 삭제합니다. 잔액은 원장 잔액을 유지합니다.`,
      )
    ) {
      return;
    }
    setLinkBusy(true);
    setLinkMsg('');
    setError('');
    try {
      const res = await fetch('/api/arrears/merge-letter-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterEntryId: id, targetEntryId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '거래처 연결 실패');
      setLinkMsg(`연결됨 → ${targetName}`);
      router.replace(`/arrears/${targetEntryId}?edit=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '거래처 연결 실패');
    } finally {
      setLinkBusy(false);
    }
  };

  const companyLabel = item?.companyName || '';
  const letterDateLabel = editing
    ? formatArrearsLetterDate(letterDate)
    : formatArrearsLetterDate(
        resolveArrearsLetterAsOfDate(letterAsOfRaw, {
          asOfDate: item?.asOfDate,
          letterDate: '',
        }),
      );
  const chargeLabelAsOf = letterAsOfRaw || item?.asOfDate || '';

  if (loading) {
    return (
      <PortalPageShell bare>
        <div className={`${portalMain} py-10 text-center text-slate-500`}>불러오는 중…</div>
      </PortalPageShell>
    );
  }

  if (!item) {
    return (
      <PortalPageShell bare>
        <div className={`${portalMain} space-y-3 py-8`}>
          {error ? <div className={portalAlertError}>{error}</div> : null}
          <Link href="/arrears" className="text-sm text-blue-800 underline">
            ← 미수관리 목록
          </Link>
        </div>
      </PortalPageShell>
    );
  }

  return (
    <PortalPageShell bare>
      <div className={`${portalMain} w-full space-y-4 py-4 print:max-w-none print:px-0`}>
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <Link href="/arrears" className="text-xs text-blue-800 underline-offset-2 hover:underline">
              ← 미수관리
            </Link>
            <h1 className="mt-1 text-xl font-bold text-slate-900">미수 내역</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.externalCode || '—'} · 담당 {item.managerName || '미지정'} · 미수 잔액{' '}
              {formatArrearsWon(item.balance)}원
            </p>
            {balanceDiff !== 0 ? (
              <p className="mt-1 text-[11px] font-semibold text-amber-800">
                현황표 잔액 {formatArrearsWon(item.balance)}원 · 내역합계{' '}
                {formatArrearsWon(letterBalance)}원 · 차이 {formatArrearsWon(balanceDiff)}
              </p>
            ) : item?.source === 'status' ? (
              <p className="mt-1 text-[11px] text-slate-500">
                잔액은 거래처(잔액)현황표 기준 · {item.asOfDate || '—'} 이전은 공문, 이후는 거래처별 상세 반영
              </p>
            ) : null}
            {editing ? (
              <p className="mt-1 text-[11px] text-slate-400">
                내역 출처: 공문 · ledger/payment · tax. 편집 시 전체 이력 표시.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <a
                  href={`/api/arrears/${id}/export`}
                  className={portalBtnSecondary}
                  title="미수수수료 안내 엑셀 다운로드"
                >
                  공문 엑셀
                </a>
                <button
                  type="button"
                  className={portalBtnSecondary}
                  disabled={saving}
                  onClick={cancelEdit}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={portalBtnPrimary}
                  disabled={saving}
                  onClick={() => void saveEdit()}
                >
                  {saving ? '저장 중…' : '저장'}
                </button>
              </>
            ) : (
              <>
                {canExcludePrior ? (
                  <label
                    className="flex items-center gap-1.5 text-xs text-slate-600"
                    title="기본은 전체 내역. 켜면 0원으로 끝난 이전 구간을 숨기고 그대로 인쇄합니다."
                  >
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={excludePriorZero}
                      onChange={e => setExcludePriorZero(e.target.checked)}
                    />
                    0원 이전내역 제외
                  </label>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-400 underline-offset-2 hover:underline"
                    onClick={startEdit}
                  >
                    수정
                  </button>
                ) : null}
                <button type="button" className={portalBtnPrimary} onClick={() => window.print()}>
                  인쇄
                </button>
              </>
            )}
          </div>
        </div>

        {error ? <div className={`${portalAlertError} print:hidden`}>{error}</div> : null}

        {editing ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={portalBtnPrimary}
                onClick={() => {
                  setManualChannel('thebill');
                  setManualOpen(true);
                }}
              >
                더빌
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() => {
                  setManualChannel('cms');
                  setManualOpen(true);
                }}
              >
                CMS
              </button>
              <button
                type="button"
                className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:underline"
                onClick={() => setShowAdvanced(v => !v)}
              >
                {showAdvanced ? '고급 접기' : '고급…'}
              </button>
            </div>
            {showAdvanced ? (
              <div className="flex flex-wrap gap-2">
                {balanceDiff !== 0 && lines.length > 0 ? (
                  <button
                    type="button"
                    className={portalBtnSecondary}
                    disabled={saving}
                    title="차이를 「원장반영」 줄로 메웁니다. 평소에는 불일치를 직접 확인하세요."
                    onClick={() => void syncWithLedger()}
                  >
                    (고급) 원장반영으로 강제 맞춤
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">
                    잔액불일치는 목록 「잔액불일치」 필터로 확인. 강제 맞춤은 비권장.
                  </span>
                )}
              </div>
            ) : null}

            {needsLedgerLink ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-amber-950">
                    거래처 연결
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                      연결필요
                    </span>
                  </p>
                  <p className="text-[11px] text-amber-900/80">
                    코드 있는 원장 업체에 붙이면 공문 내역이 옮겨집니다.
                  </p>
                </div>
                {linkMsg ? <p className="text-xs text-emerald-800">{linkMsg}</p> : null}
                {!linkLoaded ? (
                  <p className="text-xs text-slate-500">후보 불러오는 중…</p>
                ) : (
                  <>
                    {linkSuggestions.length > 0 ? (
                      <ul className="space-y-1.5">
                        {linkSuggestions.map(s => (
                          <li
                            key={s.entryId}
                            className="flex flex-wrap items-center gap-2 rounded border border-amber-100 bg-white px-2 py-1.5 text-xs"
                          >
                            <span className="font-medium text-slate-900">
                              {s.companyName}
                              <span className="ml-1 font-mono text-[10px] text-slate-400">
                                {s.externalCode}
                              </span>
                            </span>
                            <span className="text-slate-500">
                              원장 {formatArrearsWon(s.balance)}
                            </span>
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-900">
                              유사 {Math.round(s.score * 100)}%
                            </span>
                            <button
                              type="button"
                              className={`${portalBtnPrimary} ml-auto py-0.5 text-[11px]`}
                              disabled={linkBusy}
                              onClick={() =>
                                void mergeToLedger(s.entryId, s.companyName, s.externalCode)
                              }
                            >
                              {linkBusy ? '연결 중…' : '이 업체에 연결'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-500">유사 상호 후보가 없습니다. 아래에서 직접 고르세요.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 border-t border-amber-100 pt-2">
                      <input
                        className={`${portalInput} max-w-[12rem] py-1 text-xs`}
                        placeholder="원장 상호·코드 필터"
                        value={linkPickQ}
                        onChange={e => setLinkPickQ(e.target.value)}
                      />
                      <select
                        className={`${portalInput} min-w-[12rem] flex-1 py-1 text-xs`}
                        value={linkPickId}
                        onChange={e => setLinkPickId(e.target.value)}
                      >
                        <option value="">코드 있는 업체에서 고르기…</option>
                        {filteredLinkPicks.map(p => (
                          <option key={p.entryId} value={p.entryId}>
                            {p.companyName} ({p.externalCode}) · {formatArrearsWon(p.balance)}
                            {p.managerName ? ` · ${p.managerName}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={portalBtnSecondary}
                        disabled={!linkPickId || linkBusy}
                        onClick={() => {
                          const ent = linkPickEntries.find(p => p.entryId === linkPickId);
                          if (!ent) return;
                          void mergeToLedger(ent.entryId, ent.companyName, ent.externalCode);
                        }}
                      >
                        선택 연결
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            <label className="flex max-w-xs flex-col gap-1 text-xs font-medium text-slate-600">
              공문 일자
              <input
                className={`${portalInput} py-2`}
                value={letterDate}
                onChange={e => setLetterDate(e.target.value)}
                placeholder="2026.07.27"
              />
            </label>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">내역</th>
                    <th className="px-2 py-2 text-right">
                      금액(vat 포함)
                      <span className="block font-normal text-slate-400">차변·청구</span>
                    </th>
                    <th className="px-2 py-2 text-right">
                      지급내역
                      <span className="block font-normal text-slate-400">대변·입금</span>
                    </th>
                    <th className="px-2 py-2 text-left">지급일시</th>
                    <th className="px-2 py-2 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editLines.map((l, idx) => (
                    <tr key={l.key}>
                      <td className="px-2 py-1">
                        <input
                          className={`${portalInput} py-1 text-xs w-full min-w-[10rem]`}
                          value={l.description}
                          onChange={e =>
                            setEditLines(prev =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, description: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={`${portalInput} py-1 text-xs w-28 text-right tabular-nums`}
                          value={l.amount}
                          inputMode="numeric"
                          onChange={e =>
                            setEditLines(prev =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, amount: fmt(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={`${portalInput} py-1 text-xs w-28 text-right tabular-nums`}
                          value={l.paidAmount}
                          inputMode="numeric"
                          onChange={e =>
                            setEditLines(prev =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, paidAmount: fmt(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={`${portalInput} py-1 text-xs w-28`}
                          value={l.paidDate}
                          placeholder="예: 7월 2일"
                          onChange={e =>
                            setEditLines(prev =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, paidDate: e.target.value } : x,
                              ),
                            )
                          }
                          onBlur={e => {
                            const next = formatArrearsPaidDateKo(e.target.value);
                            if (next !== e.target.value) {
                              setEditLines(prev =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, paidDate: next } : x,
                                ),
                              );
                            }
                          }}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          className="text-xs text-rose-700 hover:underline"
                          onClick={() =>
                            setEditLines(prev => prev.filter((_, i) => i !== idx))
                          }
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() =>
                  setEditLines(prev => [
                    ...prev,
                    {
                      key: `new-${Date.now()}`,
                      description: '',
                      amount: '',
                      paidAmount: '',
                      paidDate: '',
                      source: 'manual',
                    },
                  ])
                }
              >
                행 추가
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() =>
                  setEditLines(prev => [
                    ...prev,
                    {
                      key: `pay-${Date.now()}`,
                      description: '',
                      amount: '',
                      paidAmount: '',
                      paidDate: todayArrearsPaidDateKo(),
                      source: 'manual',
                    },
                  ])
                }
              >
                입금만 행
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() =>
                  setEditLines(prev =>
                    prev.map(x =>
                      parseWon(x.paidAmount) > 0 && !x.paidDate.trim()
                        ? { ...x, paidDate: todayArrearsPaidDateKo() }
                        : { ...x, paidDate: formatArrearsPaidDateKo(x.paidDate) },
                    ),
                  )
                }
              >
                지급일시 한국어로
              </button>
            </div>
          </div>
        ) : null}

        {!editing ? (
        <>
        {/* 공문 본문 — 엑셀 「미수수수료 안내」양식 */}
        <article className="arrears-letter mx-auto w-full max-w-[720px] rounded-xl border border-slate-200 bg-white px-8 py-10 text-black shadow-sm print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
          <div className="arrears-letter-brand flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/arrears-letter-header.png"
              alt="세무법인청년들"
              className="h-12 w-auto object-contain print:h-11"
            />
            <p className="text-center text-[11px] tracking-wide text-slate-500 print:text-[10px]">
              Youth tax Management Corporation
            </p>
          </div>

          <h2 className="mt-5 text-center text-[22px] font-bold tracking-wide text-slate-900 underline decoration-2 underline-offset-4 print:mt-4 print:text-[20px]">
            미수 수수료 안내
          </h2>

          <div className="mt-7 flex items-start justify-between gap-4 text-[13px] text-slate-900 print:mt-6 print:text-[12px]">
            <div className="space-y-1">
              <p>
                <span className="inline-block tracking-[0.35em]">수 신</span>
                <span className="font-semibold"> : {companyLabel}</span>
              </p>
              <p>
                <span className="inline-block tracking-[0.35em]">제 목</span>
                <span> : 미수수수료 안내</span>
              </p>
            </div>
            <p className="shrink-0 tabular-nums text-slate-800">{letterDateLabel || '—'}</p>
          </div>

          <div className="mt-6 space-y-1.5 text-[13px] leading-relaxed text-slate-900 print:mt-5 print:text-[12px]">
            <p>귀사의 무궁한 발전을 기원합니다.</p>
            <p>다음과 같이 미수수수료를 안내하여 드리오니 빠른 시일내에 결제 부탁드립니다.</p>
          </div>

          <p className="mt-6 text-center text-[13px] font-semibold tracking-[0.4em] text-slate-900 print:mt-5 print:text-[12px]">
            - 다 음 -
          </p>

          <p className="mt-5 text-[13px] font-semibold text-slate-900 print:mt-4 print:text-[12px]">
            1. 미수 수수료 안내
          </p>

          {viewLines.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500 print:hidden">
              {`등록된 미수 내역이 없습니다.${canManage ? ' 「수정」에서 더빌·내역을 입력하세요.' : ''}`}
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="arrears-letter-table w-full border-collapse text-[12px] print:text-[11px]">
                <thead>
                  <tr className="bg-[#ececec]">
                    <th className="border border-[#222] px-2 py-1.5 text-left font-semibold">내역</th>
                    <th className="border border-[#222] px-2 py-1.5 text-right font-semibold whitespace-nowrap">
                      금액(vat 포함)
                    </th>
                    <th className="border border-[#222] px-2 py-1.5 text-right font-semibold whitespace-nowrap">
                      지급내역
                    </th>
                    <th className="border border-[#222] px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      지급일시
                    </th>
                    <th className="border border-[#222] px-2 py-1.5 text-right font-semibold">잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {viewLines.map((l, i) => {
                    const prev = i > 0 ? viewLines[i - 1]?.description : undefined;
                    const portalDesc = linePortalDescription(l, {
                      asOfDate: chargeLabelAsOf,
                      prevDescription: prev,
                    });
                    const paidKo = formatArrearsPaidDateKo(l.paidDate);
                    return (
                      <tr key={l.id}>
                        <td className="border border-[#222] px-2 py-1 text-slate-900">
                          <span className="print:hidden">{portalDesc}</span>
                          <span className="hidden print:inline">{l.description}</span>
                        </td>
                        <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-900">
                          {l.amount ? formatArrearsWon(l.amount) : ''}
                        </td>
                        <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-900">
                          {l.paidAmount ? formatArrearsWon(l.paidAmount) : ''}
                        </td>
                        <td className="border border-[#222] px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                          {paidKo || ''}
                        </td>
                        <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-900">
                          {formatArrearsWon(running[i] ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#ececec] font-semibold">
                    <td className="border border-[#222] px-2 py-1.5">총액</td>
                    <td className="border border-[#222] px-2 py-1.5 text-right tabular-nums">
                      {formatArrearsWon(totalAmount)}
                    </td>
                    <td className="border border-[#222] px-2 py-1.5 text-right tabular-nums">
                      {formatArrearsWon(totalPaid)}
                    </td>
                    <td className="border border-[#222] px-2 py-1.5" />
                    <td className="border border-[#222] px-2 py-1.5 text-right tabular-nums">
                      {formatArrearsWon(feeBalance)}
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td
                      className="border border-[#222] bg-[#d9d9d9] px-2 py-1.5"
                      colSpan={4}
                    >
                      미수 수수료
                    </td>
                    <td className="border border-[#222] bg-[#d9d9d9] px-2 py-1.5 text-right tabular-nums text-slate-900">
                      {formatArrearsWon(feeBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-7 text-[13px] font-semibold text-slate-900 print:mt-6 print:text-[12px]">
            2. 입금 계좌 번호
          </p>
          <p className="mt-1.5 text-[13px] text-slate-900 print:text-[12px]">{BANK_LINE}</p>

          <div className="arrears-letter-footer mt-14 flex items-end gap-3 print:mt-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/arrears-letter-footer.png"
              alt="세무법인청년들"
              className="h-10 w-auto shrink-0 object-contain print:h-9"
            />
            <div className="min-w-0 space-y-0.5 text-[11px] leading-snug text-slate-600 print:text-[10px]">
              <p>{ADDR_LINE}</p>
              <p>{TEL_LINE}</p>
            </div>
          </div>
        </article>

        {item.clientId ? (
          <p className="text-center text-xs text-slate-500 print:hidden">
            <Link
              href={`/clients/${item.clientId}`}
              className="text-blue-800 underline-offset-2 hover:underline"
            >
              수임처 카드 열기
            </Link>
          </p>
        ) : null}
        </>
        ) : null}
      </div>

      <ArrearsManualEntryModal
        open={manualOpen}
        channel={manualChannel}
        entries={item ? [item] : []}
        initialEntryId={id}
        busy={manualBusy}
        onClose={() => setManualOpen(false)}
        onSubmit={submitManual}
      />

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print,
          .print\\:hidden {
            display: none !important;
          }
          /* 안전망: 공문 외 요소 숨기고 공문만 표시 */
          body * {
            visibility: hidden !important;
          }
          .arrears-letter,
          .arrears-letter * {
            visibility: visible !important;
          }
          .arrears-letter {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            background: white !important;
            color: #111 !important;
          }
          .arrears-letter-table th,
          .arrears-letter-table td {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </PortalPageShell>
  );
}
