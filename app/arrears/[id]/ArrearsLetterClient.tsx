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
import ArrearsManualEntryModal, {
  type ManualChannel,
} from '@/app/arrears/ArrearsManualEntryModal';
import {
  formatArrearsLetterDate,
  formatArrearsPaidDateKo,
  formatArrearsWon,
  letterRunningBalances,
  todayArrearsPaidDateKo,
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
  const [manualOpen, setManualOpen] = useState(false);
  const [manualChannel, setManualChannel] = useState<ManualChannel>('thebill');
  const [manualBusy, setManualBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
            <h1 className="mt-1 text-xl font-bold text-slate-900">미수 내역</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.externalCode || '—'} · 담당 {item.managerName || '미지정'} · 미수 잔액{' '}
              {formatArrearsWon(item.balance)}원
              {lines.length > 0 ? (
                <>
                  {' '}
                  · 내역합계 {formatArrearsWon(letterBalance)}원
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
                <button type="button" className={portalBtnSecondary} onClick={startEdit}>
                  내역 편집
                </button>
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

        {canManage && !editing ? (
          <div className="print:hidden">
            <button
              type="button"
              className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:underline"
              onClick={() => setShowAdvanced(v => !v)}
            >
              {showAdvanced ? '고급 접기' : '고급…'}
            </button>
            {showAdvanced ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {balanceDiff !== 0 && lines.length > 0 ? (
                  <button
                    type="button"
                    className={portalBtnSecondary}
                    disabled={saving}
                    onClick={() => void syncWithLedger()}
                  >
                    관리잔액과 내역 맞추기
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">내역·잔액 차이가 있을 때만 맞춤 가능</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

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

          {lines.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500 print:hidden">
              등록된 미수 내역이 없습니다.
              {canManage ? ' 「더빌」로 청구 사유를 남기거나 「내역 편집」으로 입력하세요.' : ''}
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
                  {lines.map((l, i) => (
                    <tr key={l.id}>
                      <td className="border border-[#222] px-2 py-1 text-slate-900">
                        {l.description}
                      </td>
                      <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-900">
                        {l.amount ? formatArrearsWon(l.amount) : ''}
                      </td>
                      <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-900">
                        {l.paidAmount ? formatArrearsWon(l.paidAmount) : ''}
                      </td>
                      <td className="border border-[#222] px-2 py-1 text-center text-slate-800 whitespace-nowrap">
                        {l.paidDate || ''}
                      </td>
                      <td className="border border-[#222] px-2 py-1 text-right tabular-nums text-slate-900">
                        {formatArrearsWon(running[i] ?? 0)}
                      </td>
                    </tr>
                  ))}
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
                      {formatArrearsWon(letterBalance)}
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
                      {formatArrearsWon(letterBalance)}
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
