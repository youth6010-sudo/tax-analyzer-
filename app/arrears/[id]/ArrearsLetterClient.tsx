'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalMain,
} from '@/app/components/portal/uiClasses';
import CenterModal from '@/app/components/portal/CenterModal';
import {
  formatArrearsLetterDate,
  formatArrearsWon,
  letterRunningBalances,
  type ArrearsEntryDto,
  type ArrearsLetterLineDto,
  type ArrearsLetterLineInput,
} from '@/app/types/arrears';
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

type QuickMode = 'charge' | 'pay' | null;

function toEditLines(lines: ArrearsLetterLineDto[]): EditLine[] {
  return lines.map((l, i) => ({
    key: l.id || `n-${i}`,
    description: l.description,
    amount: String(l.amount || ''),
    paidAmount: String(l.paidAmount || ''),
    paidDate: l.paidDate || '',
    source: l.source,
  }));
}

function parseWon(s: string): number {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export default function ArrearsLetterClient({ id }: { id: string }) {
  const [item, setItem] = useState<ArrearsEntryDto | null>(null);
  const [lines, setLines] = useState<ArrearsLetterLineDto[]>([]);
  const [letterBalance, setLetterBalance] = useState(0);
  const [balanceDiff, setBalanceDiff] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [letterDate, setLetterDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [quick, setQuick] = useState<QuickMode>(null);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);

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
    setLetterDate(
      formatArrearsLetterDate(it.letterDate || it.asOfDate || ''),
    );
  }, [id]);

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

  const displayLines = editing ? null : lines;
  const running = useMemo(
    () => letterRunningBalances(displayLines || lines),
    [displayLines, lines],
  );
  const totalAmount = useMemo(
    () => lines.reduce((s, l) => s + l.amount, 0),
    [lines],
  );
  const totalPaid = useMemo(
    () => lines.reduce((s, l) => s + l.paidAmount, 0),
    [lines],
  );

  const startEdit = () => {
    setEditLines(toEditLines(lines));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditLines([]);
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
          paidDate: l.paidDate.trim(),
          source: l.source || 'manual',
        }))
        .filter(l => l.description);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const applyQuick = async () => {
    if (!quick) return;
    const amt = parseWon(quickAmount);
    if (amt <= 0) {
      setError('금액을 입력하세요.');
      return;
    }
    setQuickBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/arrears/${id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: quick,
          amount: amt,
          description: quickDesc.trim() || undefined,
          syncBalance: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '반영 실패');
      setItem((data as { item: ArrearsEntryDto }).item);
      setLines((data as { lines: ArrearsLetterLineDto[] }).lines || []);
      setLetterBalance((data as { letterBalance?: number }).letterBalance ?? 0);
      setBalanceDiff((data as { balanceDiff?: number }).balanceDiff ?? 0);
      setQuick(null);
      setQuickAmount('');
      setQuickDesc('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setQuickBusy(false);
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
        setError('원장 잔액과 공문 잔액이 이미 같습니다.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '맞춤 실패');
    } finally {
      setSaving(false);
    }
  };

  const companyLabel = item?.companyName || '';
  const letterDateLabel = formatArrearsLetterDate(
    letterDate || item?.letterDate || item?.asOfDate || '',
  );

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
            <h1 className="mt-1 text-xl font-bold text-slate-900">미수 수수료 안내</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.externalCode || '—'} · 담당 {item.managerName || '미지정'} · 관리잔액{' '}
              {formatArrearsWon(item.balance)}원
              {lines.length > 0 ? (
                <>
                  {' '}
                  · 공문잔액 {formatArrearsWon(letterBalance)}원
                  {balanceDiff !== 0 ? (
                    <span className="ml-1 font-semibold text-amber-800">
                      (차이 {formatArrearsWon(balanceDiff)})
                    </span>
                  ) : null}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && !editing ? (
              <>
                <button type="button" className={portalBtnSecondary} onClick={startEdit}>
                  내역 편집
                </button>
                <button
                  type="button"
                  className={portalBtnSecondary}
                  onClick={() => {
                    setQuick('charge');
                    setQuickDesc('');
                    setQuickAmount('');
                  }}
                >
                  미수 추가
                </button>
                <button
                  type="button"
                  className={portalBtnSecondary}
                  onClick={() => {
                    setQuick('pay');
                    setQuickDesc('');
                    setQuickAmount('');
                  }}
                >
                  입금
                </button>
                {balanceDiff !== 0 && lines.length > 0 ? (
                  <button
                    type="button"
                    className={portalBtnSecondary}
                    disabled={saving}
                    onClick={() => void syncWithLedger()}
                  >
                    원장 잔액과 맞추기
                  </button>
                ) : null}
              </>
            ) : null}
            {editing ? (
              <>
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
              <button type="button" className={portalBtnPrimary} onClick={() => window.print()}>
                인쇄
              </button>
            )}
          </div>
        </div>

        {error ? <div className={`${portalAlertError} print:hidden`}>{error}</div> : null}

        {editing ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
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
                    <th className="px-2 py-2 text-right">금액</th>
                    <th className="px-2 py-2 text-right">지급내역</th>
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
                          onChange={e =>
                            setEditLines(prev =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, amount: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={`${portalInput} py-1 text-xs w-28 text-right tabular-nums`}
                          value={l.paidAmount}
                          onChange={e =>
                            setEditLines(prev =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, paidAmount: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={`${portalInput} py-1 text-xs w-28`}
                          value={l.paidDate}
                          onChange={e =>
                            setEditLines(prev =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, paidDate: e.target.value } : x,
                              ),
                            )
                          }
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
          </div>
        ) : null}

        {/* 공문 본문 */}
        <article className="arrears-letter mx-auto max-w-[720px] rounded-xl border border-slate-200 bg-white px-8 py-10 shadow-sm print:max-w-none print:border-0 print:px-6 print:py-4 print:shadow-none">
          <p className="text-center text-sm tracking-wide text-slate-600">
            Youth tax Management Corporation
          </p>
          <h2 className="mt-6 text-center text-2xl font-bold tracking-wide text-slate-900">
            미수 수수료 안내
          </h2>

          <div className="mt-8 flex flex-wrap items-start justify-between gap-4 text-sm text-slate-800">
            <div className="space-y-1">
              <p>
                <span className="inline-block w-16 text-slate-500">수 신</span>
                <span className="font-semibold">: {companyLabel}</span>
              </p>
              <p>
                <span className="inline-block w-16 text-slate-500">제 목</span>
                <span>: 미수수수료 안내</span>
              </p>
            </div>
            <p className="tabular-nums text-slate-700">{letterDateLabel || '—'}</p>
          </div>

          <div className="mt-8 space-y-2 text-sm leading-relaxed text-slate-800">
            <p>귀사의 무궁한 발전을 기원합니다.</p>
            <p>
              다음과 같이 미수수수료를 안내하여 드리오니 빠른 시일내에 결제 부탁드립니다.
            </p>
          </div>

          <p className="mt-8 text-center text-sm font-semibold text-slate-800">- 다  음 -</p>

          <p className="mt-6 text-sm font-semibold text-slate-900">1. 미수 수수료 안내</p>

          {lines.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              등록된 공문 내역이 없습니다.
              {canManage
                ? ' 「내역 편집」으로 입력하거나, 목록에서 「공문 내역 가져오기」로 xls를 반영하세요.'
                : ''}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" style={{ border: '1px solid #222' }}>
                <thead>
                  <tr className="bg-[#f3f3f3]">
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
                  {lines.map((l, i) => (
                    <tr key={l.id}>
                      <td className="border border-[#222] px-2 py-1 text-slate-900">{l.description}</td>
                      <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-800">
                        {l.amount ? formatArrearsWon(l.amount) : ''}
                      </td>
                      <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-800">
                        {l.paidAmount ? formatArrearsWon(l.paidAmount) : ''}
                      </td>
                      <td className="border border-[#222] px-2 py-1 text-center text-slate-700 whitespace-nowrap">
                        {l.paidDate || ''}
                      </td>
                      <td className="border border-[#222] px-2 py-1 text-right tabular-nums font-medium text-slate-900">
                        {formatArrearsWon(running[i] ?? 0)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#f3f3f3] font-semibold">
                    <td className="border border-[#222] px-2 py-1.5">총액</td>
                    <td className="border border-[#222] px-2 py-1.5 text-right tabular-nums">
                      {formatArrearsWon(totalAmount)}
                    </td>
                    <td className="border border-[#222] px-2 py-1.5 text-right tabular-nums">
                      {formatArrearsWon(totalPaid)}
                    </td>
                    <td className="border border-[#222] px-2 py-1.5" />
                    <td className="border border-[#222] px-2 py-1.5 text-right tabular-nums">
                      {formatArrearsWon(letterBalance)}
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="border border-[#222] px-2 py-1.5" colSpan={4}>
                      미수 수수료
                    </td>
                    <td className="border border-[#222] px-2 py-1.5 text-right tabular-nums text-rose-800">
                      {formatArrearsWon(letterBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-8 text-sm font-semibold text-slate-900">2. 입금 계좌 번호</p>
          <p className="mt-2 text-sm text-slate-800">{BANK_LINE}</p>

          <div className="mt-12 space-y-1 text-center text-xs text-slate-600">
            <p>{ADDR_LINE}</p>
            <p>{TEL_LINE}</p>
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
      </div>

      <CenterModal
        open={!!quick}
        onClose={() => {
          if (quickBusy) return;
          setQuick(null);
        }}
        title={quick === 'pay' ? '입금 반영' : '미수 추가'}
      >
        {quick ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {companyLabel} 공문 내역에{' '}
              {quick === 'pay' ? '입금' : '미수'} 행을 추가하고 잔액을 맞춥니다.
            </p>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              내역 (선택)
              <input
                className={`${portalInput} py-2`}
                value={quickDesc}
                onChange={e => setQuickDesc(e.target.value)}
                placeholder={quick === 'pay' ? '입금' : '미수 추가'}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              금액
              <input
                autoFocus
                className={`${portalInput} py-2 tabular-nums`}
                inputMode="numeric"
                value={quickAmount}
                onChange={e => setQuickAmount(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void applyQuick();
                }}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={portalBtnSecondary}
                disabled={quickBusy}
                onClick={() => setQuick(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={portalBtnPrimary}
                disabled={quickBusy}
                onClick={() => void applyQuick()}
              >
                {quickBusy ? '반영 중…' : '반영'}
              </button>
            </div>
          </div>
        ) : null}
      </CenterModal>

      <style>{`
        @media print {
          nav, aside, header, .print\\:hidden { display: none !important; }
          body { background: white !important; }
          .arrears-letter {
            border: none !important;
            box-shadow: none !important;
            max-width: none !important;
            padding: 0.5rem 1rem !important;
          }
        }
      `}</style>
    </PortalPageShell>
  );
}
