'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import { portalBtnPrimary, portalBtnSecondary, portalInput, portalMain } from '@/app/components/portal/uiClasses';
import CenterModal from '@/app/components/portal/CenterModal';
import type { LeaveBalanceDto, LeaveHalfSlot, LeaveKind, LeaveRequestDto } from '@/app/types/leave';
import {
  formatLeaveKindLabel,
  leaveStatusLabel,
} from '@/app/types/leave';

type Tab = 'balances' | 'mine' | 'pending';

function formatNum(n: number): string {
  return (Math.round(n * 10000) / 10000).toString();
}

export default function LeavePageClient() {
  const nowYear = new Date().getFullYear();
  const [tab, setTab] = useState<Tab>('balances');
  const [year, setYear] = useState(nowYear);
  const [balances, setBalances] = useState<LeaveBalanceDto[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [mine, setMine] = useState<LeaveRequestDto[]>([]);
  const [pending, setPending] = useState<LeaveRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editBalance, setEditBalance] = useState<LeaveBalanceDto | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [detail, setDetail] = useState<LeaveRequestDto | null>(null);

  const loadBalances = useCallback(async () => {
    const res = await fetch(`/api/leave/balances?year=${year}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '잔고 조회 실패');
    setBalances((data as { items: LeaveBalanceDto[] }).items || []);
    setCanManage(!!(data as { canManage?: boolean }).canManage);
  }, [year]);

  const loadMine = useCallback(async () => {
    const res = await fetch(`/api/leave/requests?mine=1&year=${year}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '신청 조회 실패');
    setMine((data as { items: LeaveRequestDto[] }).items || []);
    setCanApprove(!!(data as { canApprove?: boolean }).canApprove);
  }, [year]);

  const loadPending = useCallback(async () => {
    const res = await fetch(`/api/leave/requests?pending=1&year=${year}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      setPending([]);
      return;
    }
    if (!res.ok) throw new Error((data as { error?: string }).error || '결재 조회 실패');
    setPending((data as { items: LeaveRequestDto[] }).items || []);
    setCanApprove(true);
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const results = await Promise.allSettled([
          loadBalances(),
          loadMine(),
          loadPending(),
        ]);
        if (cancelled) return;
        const failed = results.find(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        // 결재 API 실패는 무시(권한), 잔고/내 신청 실패만 표시
        if (results[0].status === 'rejected') {
          setError(
            results[0].reason instanceof Error
              ? results[0].reason.message
              : '불러오기 실패',
          );
        } else if (results[1].status === 'rejected') {
          setError(
            results[1].reason instanceof Error
              ? results[1].reason.message
              : '신청 목록 불러오기 실패',
          );
        } else if (failed && results[2].status === 'rejected') {
          /* pending optional */
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '불러오기 실패');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBalances, loadMine, loadPending]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.allSettled([loadBalances(), loadMine(), loadPending()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [loadBalances, loadMine, loadPending]);

  const tabs = useMemo(() => {
    const list: { id: Tab; label: string }[] = [
      { id: 'balances', label: '연차 잔고' },
      { id: 'mine', label: '내 신청' },
    ];
    if (canApprove) list.push({ id: 'pending', label: `결재 대기 (${pending.length})` });
    return list;
  }, [canApprove, pending.length]);

  return (
    <PortalPageShell bare>
      <div className={`${portalMain} w-full py-4 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">휴가관리</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              신청 후 인디 세무사 승인 시 연차가 사용됩니다. 잔고는 본인만 보이며, 전체 조회·수정은
              인디·페리만 가능합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setYear(y => y - 1)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold"
            >
              ‹
            </button>
            <span className="min-w-[4.5rem] text-center text-sm font-bold tabular-nums">{year}년</span>
            <button
              type="button"
              onClick={() => setYear(y => y + 1)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setApplyOpen(true)}
              className={portalBtnPrimary + ' text-xs py-1.5'}
            >
              휴가 신청
            </button>
          </div>
        </div>

        <div className="flex w-fit rounded-lg border border-slate-200 p-0.5 text-sm font-semibold">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 ${
                tab === t.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">불러오는 중…</p>
        ) : tab === 'balances' ? (
          <BalancesTable
            items={balances}
            canManage={canManage}
            onEdit={row => setEditBalance({ ...row })}
          />
        ) : tab === 'mine' ? (
          <RequestTable
            items={mine}
            onOpen={setDetail}
            empty="신청 내역이 없습니다."
          />
        ) : (
          <RequestTable
            items={pending}
            onOpen={setDetail}
            empty="대기 중인 결재가 없습니다."
          />
        )}
      </div>

      <CenterModal
        open={!!editBalance}
        title="연차 잔고 수정"
        description="발생·이월·증가·감소를 직접 입력합니다. 사용·잔여는 승인 내역으로 계산됩니다."
        onClose={() => setEditBalance(null)}
      >
        {editBalance && (
          <BalanceEditForm
            item={editBalance}
            onCancel={() => setEditBalance(null)}
            onSaved={async () => {
              setEditBalance(null);
              await loadBalances();
            }}
          />
        )}
      </CenterModal>

      <CenterModal
        open={applyOpen}
        title="휴가 신청"
        description="연차 또는 오전/오후 반차를 신청합니다. 인디 승인 후 반영됩니다."
        onClose={() => setApplyOpen(false)}
      >
        <LeaveApplyForm
          onCancel={() => setApplyOpen(false)}
          onCreated={async () => {
            setApplyOpen(false);
            setTab('mine');
            await refresh();
          }}
        />
      </CenterModal>

      <CenterModal
        open={!!detail}
        title="휴가 상세"
        onClose={() => setDetail(null)}
      >
        {detail && (
          <LeaveDetailPanel
            item={detail}
            canApprove={canApprove}
            onClose={() => setDetail(null)}
            onChanged={async () => {
              setDetail(null);
              await refresh();
            }}
          />
        )}
      </CenterModal>
    </PortalPageShell>
  );
}

function BalancesTable({
  items,
  canManage,
  onEdit,
}: {
  items: LeaveBalanceDto[];
  canManage: boolean;
  onEdit: (row: LeaveBalanceDto) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <th className="px-3 py-2.5 font-semibold">이름</th>
            <th className="px-3 py-2.5 font-semibold">입사일</th>
            <th className="px-3 py-2.5 font-semibold">퇴사일</th>
            <th className="px-3 py-2.5 font-semibold">발생</th>
            <th className="px-3 py-2.5 font-semibold">이월</th>
            <th className="px-3 py-2.5 font-semibold">증가</th>
            <th className="px-3 py-2.5 font-semibold">감소</th>
            <th className="px-3 py-2.5 font-semibold">휴가 일수</th>
            <th className="px-3 py-2.5 font-semibold">사용</th>
            <th className="px-3 py-2.5 font-semibold">잔여</th>
            {canManage && <th className="px-3 py-2.5 font-semibold" />}
          </tr>
        </thead>
        <tbody>
          {items.map(row => (
            <tr key={row.memberName} className="border-b border-slate-100 hover:bg-slate-50/80">
              <td className="px-3 py-2.5 font-semibold text-slate-900">{row.memberName}</td>
              <td className="px-3 py-2.5 tabular-nums text-slate-600">{row.hireDate || '—'}</td>
              <td className="px-3 py-2.5 tabular-nums text-slate-600">{row.resignDate || '—'}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatNum(row.accrued)}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatNum(row.carryOver)}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatNum(row.increase)}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatNum(row.decrease)}</td>
              <td className="px-3 py-2.5 tabular-nums font-semibold">{formatNum(row.totalDays)}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatNum(row.usedDays)}</td>
              <td className="px-3 py-2.5 tabular-nums font-bold text-[#1e3a8a]">
                {formatNum(row.remainingDays)}
              </td>
              {canManage && (
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="text-xs font-semibold text-[#4b6cb7] hover:underline"
                  >
                    수정
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequestTable({
  items,
  onOpen,
  empty,
}: {
  items: LeaveRequestDto[];
  onOpen: (item: LeaveRequestDto) => void;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <th className="px-3 py-2.5 font-semibold">일자</th>
            <th className="px-3 py-2.5 font-semibold">상태</th>
            <th className="px-3 py-2.5 font-semibold">구분</th>
            <th className="px-3 py-2.5 font-semibold">제목</th>
            <th className="px-3 py-2.5 font-semibold">작성자</th>
            <th className="px-3 py-2.5 font-semibold">일수</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr
              key={item.id}
              className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
              onClick={() => onOpen(item)}
            >
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">
                {item.startDate === item.endDate
                  ? item.startDate
                  : `${item.startDate} ~ ${item.endDate}`}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                {formatLeaveKindLabel(item.leaveKind, item.halfSlot)}
              </td>
              <td className="max-w-xs px-3 py-2.5 font-medium text-slate-900">
                <span className="line-clamp-1">{item.title}</span>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{item.applicantName}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatNum(item.days)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: LeaveRequestDto['status'] }) {
  const label = leaveStatusLabel(status);
  const cls =
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'rejected'
        ? 'bg-red-50 text-red-700'
        : status === 'cancelled'
          ? 'bg-slate-100 text-slate-500'
          : 'bg-amber-50 text-amber-800';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
  );
}

function BalanceEditForm({
  item,
  onCancel,
  onSaved,
}: {
  item: LeaveBalanceDto;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [hireDate, setHireDate] = useState(item.hireDate);
  const [resignDate, setResignDate] = useState(item.resignDate);
  const [useHireDateBasis, setUseHireDateBasis] = useState(item.useHireDateBasis);
  const [accrued, setAccrued] = useState(String(item.accrued));
  const [carryOver, setCarryOver] = useState(String(item.carryOver));
  const [increase, setIncrease] = useState(String(item.increase));
  const [decrease, setDecrease] = useState(String(item.decrease));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/leave/balances', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberName: item.memberName,
          year: item.year,
          hireDate,
          resignDate,
          useHireDateBasis,
          accrued: Number(accrued) || 0,
          carryOver: Number(carryOver) || 0,
          increase: Number(increase) || 0,
          decrease: Number(decrease) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-800">
        {item.memberName} · {item.year}년
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-600">입사일</span>
          <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} className={portalInput + ' w-full text-xs'} />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-600">퇴사일</span>
          <input type="date" value={resignDate} onChange={e => setResignDate(e.target.value)} className={portalInput + ' w-full text-xs'} />
        </label>
      </div>
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={useHireDateBasis}
          onChange={e => setUseHireDateBasis(e.target.checked)}
        />
        입사일 기준
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['발생', accrued, setAccrued],
            ['이월', carryOver, setCarryOver],
            ['증가', increase, setIncrease],
            ['감소', decrease, setDecrease],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className="block text-xs">
            <span className="mb-1 block font-semibold text-slate-600">{label}</span>
            <input
              type="number"
              step="0.5"
              min={0}
              value={value}
              onChange={e => set(e.target.value)}
              className={portalInput + ' w-full text-xs'}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} disabled={saving} className={portalBtnPrimary + ' text-xs py-1.5'}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" onClick={onCancel} className={portalBtnSecondary + ' text-xs py-1.5'}>
          취소
        </button>
      </div>
    </div>
  );
}

function LeaveApplyForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [leaveKind, setLeaveKind] = useState<LeaveKind>('full');
  const [halfSlot, setHalfSlot] = useState<LeaveHalfSlot>('am');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [title, setTitle] = useState('연차 승인 계획서');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (leaveKind === 'half') {
      setEndDate(startDate);
      setTitle(halfSlot === 'am' ? '오전 반차 승인 계획서' : '오후 반차 승인 계획서');
    } else {
      setTitle('연차 승인 계획서');
    }
  }, [leaveKind, halfSlot, startDate]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          leaveKind,
          halfSlot: leaveKind === 'half' ? halfSlot : '',
          startDate,
          endDate: leaveKind === 'half' ? startDate : endDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '신청 실패');
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : '신청 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            checked={leaveKind === 'full'}
            onChange={() => setLeaveKind('full')}
          />
          연차
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            checked={leaveKind === 'half'}
            onChange={() => setLeaveKind('half')}
          />
          반차
        </label>
      </div>
      {leaveKind === 'half' && (
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              checked={halfSlot === 'am'}
              onChange={() => setHalfSlot('am')}
            />
            오전 반차
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              checked={halfSlot === 'pm'}
              onChange={() => setHalfSlot('pm')}
            />
            오후 반차
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-600">시작일</span>
          <input
            type="date"
            value={startDate}
            onChange={e => {
              setStartDate(e.target.value);
              if (leaveKind === 'half') setEndDate(e.target.value);
            }}
            className={portalInput + ' w-full text-xs'}
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-slate-600">종료일</span>
          <input
            type="date"
            value={endDate}
            disabled={leaveKind === 'half'}
            onChange={e => setEndDate(e.target.value)}
            className={portalInput + ' w-full text-xs disabled:bg-slate-100'}
          />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-slate-600">제목</span>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={portalInput + ' w-full text-xs'}
        />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-slate-600">내용</span>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          className={portalInput + ' w-full text-xs'}
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void submit()} disabled={saving} className={portalBtnPrimary + ' text-xs py-1.5'}>
          {saving ? '신청 중…' : '신청'}
        </button>
        <button type="button" onClick={onCancel} className={portalBtnSecondary + ' text-xs py-1.5'}>
          취소
        </button>
      </div>
    </div>
  );
}

function LeaveDetailPanel({
  item,
  canApprove,
  onClose,
  onChanged,
}: {
  item: LeaveRequestDto;
  canApprove: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState(item.reviewNote || '네');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState('');

  useEffect(() => {
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setMe((d as { user?: { name?: string } })?.user?.name || ''))
      .catch(() => { /* ignore */ });
  }, []);

  const isApplicant = !!me && me === item.applicantName;

  const act = async (action: 'approve' | 'reject' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/leave/requests/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNote: note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '처리 실패');
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1.5 text-xs">
        <dt className="font-semibold text-slate-500">구분</dt>
        <dd>{formatLeaveKindLabel(item.leaveKind, item.halfSlot)}</dd>
        <dt className="font-semibold text-slate-500">작성자</dt>
        <dd>{item.applicantName}</dd>
        <dt className="font-semibold text-slate-500">제목</dt>
        <dd className="font-semibold text-slate-900">{item.title}</dd>
        <dt className="font-semibold text-slate-500">기간</dt>
        <dd className="tabular-nums">
          {item.startDate === item.endDate
            ? item.startDate
            : `${item.startDate} ~ ${item.endDate}`}
        </dd>
        <dt className="font-semibold text-slate-500">휴가일수</dt>
        <dd className="tabular-nums">{formatNum(item.days)}</dd>
        <dt className="font-semibold text-slate-500">상태</dt>
        <dd>
          <StatusBadge status={item.status} />
        </dd>
      </dl>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">내용</p>
        <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {item.body || '—'}
        </p>
      </div>
      {(item.status !== 'pending' || canApprove) && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">검토 의견</p>
          {item.status === 'pending' && canApprove ? (
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              className={portalInput + ' w-full text-xs'}
            />
          ) : (
            <p className="text-xs text-slate-700">
              {item.reviewedBy ? `${item.reviewedBy}: ` : ''}
              {item.reviewNote || '—'}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {canApprove && item.status === 'pending' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('approve')}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              승인
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('reject')}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              반려
            </button>
          </>
        )}
        {item.status === 'pending' && isApplicant && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('cancel')}
            className={portalBtnSecondary + ' text-xs py-1.5'}
          >
            신청 취소
          </button>
        )}
        <button type="button" onClick={onClose} className={portalBtnSecondary + ' text-xs py-1.5'}>
          닫기
        </button>
      </div>
    </div>
  );
}
