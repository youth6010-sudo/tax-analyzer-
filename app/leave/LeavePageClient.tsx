'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import { portalBtnPrimary, portalBtnSecondary, portalInput, portalMain } from '@/app/components/portal/uiClasses';
import CenterModal from '@/app/components/portal/CenterModal';
import LeaveApplyForm from '@/app/components/leave/LeaveApplyForm';
import type { LeaveBalanceDto, LeaveRequestDto } from '@/app/types/leave';
import {
  formatLeaveKindLabel,
  leaveStatusLabel,
} from '@/app/types/leave';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';
import { canReviewLeaveRequest, canDeleteCancelledLeave, canApplyLeave } from '@/lib/leaveAccess';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
type Tab = 'balances' | 'mine';

function formatNum(n: number): string {
  return (Math.round(n * 10000) / 10000).toString();
}

export default function LeavePageClient() {
  const nowYear = new Date().getFullYear();
  const [tab, setTab] = useState<Tab>('mine');
  const [year, setYear] = useState(nowYear);
  const [balances, setBalances] = useState<LeaveBalanceDto[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [viewerName, setViewerName] = useState('');
  const [canApprove, setCanApprove] = useState(false);
  const [canViewAll, setCanViewAll] = useState(false);
  const [canApply, setCanApply] = useState(true);
  const [mine, setMine] = useState<LeaveRequestDto[]>([]);
  const [statusMembers, setStatusMembers] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editBalance, setEditBalance] = useState<LeaveBalanceDto | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [detail, setDetail] = useState<LeaveRequestDto | null>(null);

  const loadBalances = useCallback(async () => {
    const res = await fetchWithTimeout(`/api/leave/balances?year=${year}`, { cache: 'no-store' }, 15_000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '잔고 조회 실패');
    setBalances((data as { items: LeaveBalanceDto[] }).items || []);
    setCanManage(!!(data as { canManage?: boolean }).canManage);
    setViewerName((data as { viewerName?: string }).viewerName || '');
  }, [year]);

  const loadMine = useCallback(async () => {
    const qs = new URLSearchParams({ year: String(year) });
    if (memberFilter) qs.set('applicant', memberFilter);
    // 인디: all=1 (전체). 권한/오류 시 본인만.
    let res = await fetchWithTimeout(
      `/api/leave/requests?all=1&${qs}`,
      { cache: 'no-store' },
      15_000,
    );
    if (!res.ok) {
      res = await fetchWithTimeout(
        `/api/leave/requests?mine=1&year=${year}`,
        { cache: 'no-store' },
        15_000,
      );
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '신청 조회 실패');
    setMine((data as { items: LeaveRequestDto[] }).items || []);
    setCanApprove(!!(data as { canApprove?: boolean }).canApprove);
    setCanViewAll(!!(data as { canViewAll?: boolean }).canViewAll);
    const members = (data as { members?: string[] }).members;
    if (members?.length) setStatusMembers(members);
  }, [year, memberFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const meRes = await fetchWithTimeout('/api/auth/me', {}, 10_000);
        if (meRes.ok) {
          const me = (await meRes.json()) as {
            user?: { name?: string; loginId?: string; role?: string | null; adminMode?: boolean | null };
          };
          if (!cancelled && me.user) {
            setCanApply(canApplyLeave({ loginId: me.user.loginId, name: me.user.name }));
            if (me.user.name) setViewerName(me.user.name.trim());
          }
        }
        const results = await Promise.allSettled([loadBalances(), loadMine()]);
        if (cancelled) return;
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
  }, [loadBalances, loadMine]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.allSettled([loadBalances(), loadMine()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [loadBalances, loadMine]);

  const tabs = useMemo((): { id: Tab; label: string }[] => {
    const list: { id: Tab; label: string }[] = [];
    if (canManage) list.push({ id: 'balances', label: '연차 잔고' });
    list.push({ id: 'mine', label: '휴가현황' });
    return list;
  }, [canManage]);

  const myBalance = useMemo(() => {
    // 인디(결재권자)는 연차 잔고·신청 대상 아님
    if (!canApply || !viewerName) return null;
    return balances.find(b => managerNamesMatch(b.memberName, viewerName)) ?? null;
  }, [balances, viewerName, canApply]);

  useEffect(() => {
    if (!canManage && tab === 'balances') setTab('mine');
  }, [canManage, tab]);

  return (
    <PortalPageShell bare>
      <div className={`${portalMain} w-full py-4 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PageHeaderIcon name="leave" />
            <div>
            <h1 className="text-xl font-bold text-slate-900">휴가관리</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              팀원(찰리)은 팀장(리아) 승인 후 인디 최종 결재로 올라갑니다. 그 외는 인디에게 바로
              결재됩니다. 인디는 결재권자로 연차 잔고·신청 대상이 아닙니다. 최종 승인 시 연차
              사용·캘린더 반영. 본인 연차 잔고는 휴가현황 상단에 표시되고, 전직원 연차 잔고·수정은
              인디·페리만 가능합니다. 결재 알림은 홈 To Do의 휴가 결재에 표시됩니다.
            </p>
            </div>
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
            {canApply && (
              <button
                type="button"
                onClick={() => setApplyOpen(true)}
                className={portalBtnPrimary + ' text-xs py-1.5'}
              >
                휴가 신청
              </button>
            )}
          </div>
        </div>

        {tabs.length > 1 && (
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
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">불러오는 중…</p>
        ) : tab === 'balances' && canManage ? (
          <BalancesTable
            items={balances}
            canManage={canManage}
            onEdit={row => setEditBalance({ ...row })}
          />
        ) : (
          <div className="space-y-3">
            {myBalance && <MyBalanceSummary balance={myBalance} year={year} />}
            {canViewAll && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">
                  담당자
                  <select
                    value={memberFilter}
                    onChange={e => setMemberFilter(e.target.value)}
                    className={portalInput + ' ml-1.5 text-xs py-1'}
                  >
                    <option value="">전체</option>
                    {(statusMembers.length
                      ? statusMembers
                      : [...new Set(mine.map(i => i.applicantName))]
                    ).map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-[11px] text-slate-500">총 {mine.length}건</span>
              </div>
            )}
            <RequestTable
              items={mine}
              onOpen={setDetail}
              empty="신청 내역이 없습니다."
            />
          </div>
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
        open={applyOpen && canApply}
        title="휴가 신청"
        description="연차 또는 오전/오후 반차를 신청합니다."
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

function MyBalanceSummary({ balance, year }: { balance: LeaveBalanceDto; year: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">내 연차 잔고 · {year}년</p>
        <p className="text-xs text-slate-500">{balance.memberName}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <div>
          <p className="text-[11px] font-semibold text-slate-500">잔여</p>
          <p className="text-lg font-bold tabular-nums text-[#1e3a8a]">
            {formatNum(balance.remainingDays)}
            <span className="ml-0.5 text-xs font-semibold text-slate-500">일</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-500">휴가 일수</p>
          <p className="font-semibold tabular-nums text-slate-800">{formatNum(balance.totalDays)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-500">사용</p>
          <p className="font-semibold tabular-nums text-slate-800">{formatNum(balance.usedDays)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-500">신청중</p>
          <p className="font-semibold tabular-nums text-amber-800">
            {formatNum(balance.pendingDays ?? 0)}
          </p>
        </div>
      </div>
    </div>
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
            <th className="px-3 py-2.5 font-semibold">사용일</th>
            <th className="px-3 py-2.5 font-semibold">신청일</th>
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
              <td className="px-3 py-2.5 tabular-nums text-amber-800">
                {formatNum(row.pendingDays ?? 0)}
              </td>
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
            <th className="px-3 py-2.5 font-semibold">신청일</th>
            <th className="px-3 py-2.5 font-semibold">휴가일</th>
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
                {formatRequestDate(item.createdAt)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">
                {item.startDate === item.endDate
                  ? item.startDate
                  : `${item.startDate} ~ ${item.endDate}`}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={item.status} approvalStep={item.approvalStep} />
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

function formatRequestDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function StatusBadge({
  status,
  approvalStep,
}: {
  status: LeaveRequestDto['status'];
  approvalStep?: LeaveRequestDto['approvalStep'];
}) {
  const label = leaveStatusLabel(status, approvalStep);
  const cls =
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'rejected'
        ? 'bg-red-50 text-red-700'
        : status === 'cancelled'
          ? 'bg-slate-100 text-slate-500'
          : status === 'cancel_requested'
            ? 'bg-orange-50 text-orange-800'
            : approvalStep === 'team_lead'
              ? 'bg-sky-50 text-sky-800'
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

function LeaveDetailPanel({
  item,
  canApprove: canApproveProp,
  onClose,
  onChanged,
}: {
  item: LeaveRequestDto;
  canApprove: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState(
    item.approvalStep === 'team_lead'
      ? item.teamLeadReviewNote || ''
      : item.reviewNote || '',
  );
  const [cancelNote, setCancelNote] = useState(item.cancelRequestNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ name: string; loginId: string }>({ name: '', loginId: '' });

  useEffect(() => {
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const user = (d as { user?: { name?: string; loginId?: string } })?.user;
        setMe({ name: user?.name || '', loginId: user?.loginId || '' });
      })
      .catch(() => { /* ignore */ });
  }, []);

  const isApplicant = !!me.name && managerNamesMatch(me.name, item.applicantName);
  const canApproveThis =
    canApproveProp &&
    canReviewLeaveRequest(
      { name: me.name, loginId: me.loginId },
      item,
    );
  const isCancelReview = item.status === 'cancel_requested';

  const act = async (
    action:
      | 'approve'
      | 'reject'
      | 'cancel'
      | 'delete'
      | 'request_cancel'
      | 'withdraw_cancel',
  ) => {
    if (action === 'delete') {
      if (!window.confirm('취소된 신청을 삭제할까요? 삭제 후에는 복구할 수 없습니다.')) return;
    }
    if (action === 'request_cancel') {
      if (!window.confirm('취소 요청을 보낼까요? 인디 승인 후 휴가가 취소됩니다.')) return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/leave/requests/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reviewNote: note,
          cancelNote,
        }),
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

  const approveLabel = isCancelReview
    ? '취소 승인'
    : item.approvalStep === 'team_lead'
      ? '팀장 승인 (인디로 전달)'
      : '최종 승인';
  const rejectLabel = isCancelReview ? '취소 반려' : '반려';

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
          <StatusBadge status={item.status} approvalStep={item.approvalStep} />
        </dd>
      </dl>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">내용</p>
        <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {item.body || '—'}
        </p>
      </div>
      {item.teamLeadReviewedBy ? (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">팀장 의견</p>
          <p className="text-xs text-slate-700">
            {item.teamLeadReviewedBy}: {item.teamLeadReviewNote || '—'}
          </p>
        </div>
      ) : null}
      {(item.cancelRequestNote || isCancelReview) && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">취소 요청 사유</p>
          <p className="text-xs text-slate-700">{item.cancelRequestNote || '—'}</p>
        </div>
      )}
      {(item.status !== 'pending' || canApproveThis) && !isCancelReview && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">
            {item.approvalStep === 'team_lead' && item.status === 'pending'
              ? '팀장 검토 의견'
              : '최종 검토 의견'}
          </p>
          {item.status === 'pending' && canApproveThis ? (
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
      {isCancelReview && canApproveThis && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">취소 검토 의견</p>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            className={portalInput + ' w-full text-xs'}
            placeholder="필요 시 의견"
          />
        </div>
      )}
      {item.status === 'approved' && isApplicant && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">취소 요청 사유 (선택)</p>
          <input
            value={cancelNote}
            onChange={e => setCancelNote(e.target.value)}
            className={portalInput + ' w-full text-xs'}
            placeholder="사유를 남기면 인디 검토에 도움이 됩니다"
          />
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {canApproveThis && (item.status === 'pending' || isCancelReview) && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('approve')}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {approveLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('reject')}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {rejectLabel}
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
        {item.status === 'approved' && isApplicant && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('request_cancel')}
            className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
          >
            취소 요청 (인디)
          </button>
        )}
        {isCancelReview && isApplicant && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('withdraw_cancel')}
            className={portalBtnSecondary + ' text-xs py-1.5'}
          >
            취소 요청 철회
          </button>
        )}
        {item.status === 'cancelled' && isApplicant && canDeleteCancelledLeave(item) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('delete')}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
        )}
        {item.status === 'cancelled' &&
          isApplicant &&
          !canDeleteCancelledLeave(item) && (
            <p className="w-full text-[11px] text-slate-500">
              승인 후 취소된 휴가는 삭제할 수 없습니다.
            </p>
          )}
        <button type="button" onClick={onClose} className={portalBtnSecondary + ' text-xs py-1.5'}>
          닫기
        </button>
      </div>
    </div>
  );
}
