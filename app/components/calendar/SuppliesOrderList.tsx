'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PersonalChecklistDto, SuppliesOrderDto } from '@/app/types/calendar';
import {
  formatCalendarCreatedAt,
  formatCheckoffCompletedAt,
} from '@/app/types/calendar';
import PersonalChecklistAddForm from '@/app/components/calendar/PersonalChecklistAddForm';
import CenterModal from '@/app/components/portal/CenterModal';

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function SuppliesOrderList() {
  const [items, setItems] = useState<SuppliesOrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<PersonalChecklistDto | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/supplies-orders', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(((data as { items?: SuppliesOrderDto[] }).items) ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = hideCompleted
    ? items.filter(i => !(i.checkoffDone != null && i.checkoffTotal != null
      ? i.checkoffDone >= i.checkoffTotal
      : i.completed))
    : items;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">비품 주문 목록</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            요청일과 다야 주문완료일(완료처리일)을 확인합니다. 캘린더에는 표시되지 않습니다.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={e => setHideCompleted(e.target.checked)}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          완료 숨기기
        </label>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">비품 주문 요청이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">요청일</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">주문일</th>
                <th className="px-3 py-2.5 font-semibold">내용</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">요청자</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(item => {
                const allDone =
                  item.checkoffDone != null && item.checkoffTotal != null
                    ? item.checkoffDone >= item.checkoffTotal
                    : item.completed;
                const ordered = Boolean(item.orderedAt);
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                    onClick={() => setEditItem(item)}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">
                      {formatDateOnly(item.requestedAt)}
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {formatCalendarCreatedAt(item.requestedAt)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">
                      {ordered ? (
                        <>
                          {formatDateOnly(item.orderedAt)}
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            {formatCheckoffCompletedAt(item.orderedAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">미주문</span>
                      )}
                    </td>
                    <td className="max-w-xs px-3 py-2.5 font-medium text-slate-900">
                      <span className="line-clamp-2">{item.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {item.ownerName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {allDone ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          완료
                        </span>
                      ) : ordered ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                          주문됨
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          대기
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CenterModal
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        title="비품 주문 요청"
      >
        {editItem ? (
          <PersonalChecklistAddForm
            editItem={editItem}
            inModal
            onUpdated={(item) => {
              if (item) setEditItem(item);
              void load();
            }}
            onDeleted={() => {
              setEditItem(null);
              void load();
            }}
            onCheckoffChange={(item) => {
              if (item) setEditItem(item);
              void load();
            }}
            onCancel={() => setEditItem(null)}
          />
        ) : null}
      </CenterModal>
    </div>
  );
}
