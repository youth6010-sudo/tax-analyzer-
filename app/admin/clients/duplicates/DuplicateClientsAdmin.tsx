'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import type { DuplicateClientItem, DuplicateGroup } from '@/app/types/clientDuplicates';
import { REASON_LABEL } from '@/app/types/clientDuplicates';

const STATUS_LABEL: Record<string, string> = {
  active: '수임',
  intake: '유입',
  churned: '유출',
};

const SOURCE_LABEL: Record<string, string> = {
  tp_import: 'TP',
  manual_intake: '유입',
  youth_excel: '청년엑셀',
  douzone_export: '더존',
};

function relatedSummary(counts: DuplicateClientItem['relatedCounts']) {
  const parts: string[] = [];
  if (counts.inquiries) parts.push(`유입문의 ${counts.inquiries}`);
  if (counts.processes) parts.push(`프로세스 ${counts.processes}`);
  if (counts.churns) parts.push(`유출 ${counts.churns}`);
  if (counts.meetings) parts.push(`미팅 ${counts.meetings}`);
  if (counts.reports) parts.push(`리포트 ${counts.reports}`);
  if (counts.settlements) parts.push(`가결산 ${counts.settlements}`);
  return parts.length ? parts.join(' · ') : '연결 데이터 없음';
}

function ClientRow({
  client,
  groupId,
  isSurvivor,
  onSelectSurvivor,
  onSaved,
  onDeleted,
}: {
  client: DuplicateClientItem;
  groupId: string;
  isSurvivor: boolean;
  onSelectSurvivor: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [companyName, setCompanyName] = useState(client.companyName);
  const [businessNo, setBusinessNo] = useState(client.businessNo);
  const [manager, setManager] = useState(client.manager);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setCompanyName(client.companyName);
    setBusinessNo(client.businessNo);
    setManager(client.manager);
  }, [client]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, businessNo, manager }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '저장 실패');
      }
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`"${client.companyName}" 수임처를 삭제할까요?\n연결된 시트 데이터는 연결만 해제됩니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '삭제 실패');
      }
      onDeleted();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const dirty =
    companyName !== client.companyName
    || businessNo !== client.businessNo
    || manager !== client.manager;

  return (
    <div className={`rounded-xl border p-4 ${isSurvivor ? 'border-blue-300 bg-blue-50/50' : 'border-gray-100 bg-white'}`}>
      <div className="flex items-start gap-3">
        <label className="flex items-center gap-2 shrink-0 pt-1 cursor-pointer">
          <input
            type="radio"
            name={`survivor-${groupId}`}
            checked={isSurvivor}
            onChange={onSelectSurvivor}
            className="text-blue-600"
          />
          <span className="text-[10px] font-bold text-gray-500">정본</span>
        </label>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              client.status === 'active' ? 'bg-emerald-100 text-emerald-800'
                : client.status === 'intake' ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-800'
            }`}>
              {STATUS_LABEL[client.status] ?? client.status}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
              {SOURCE_LABEL[client.source] ?? client.source}
            </span>
            <Link
              href={`/clients/${client.id}`}
              className="text-[10px] font-bold text-blue-600 hover:underline"
            >
              상세 보기
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block sm:col-span-2">
              <span className="text-[10px] font-bold text-gray-400">업체명</span>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-400">담당</span>
              <input
                value={manager}
                onChange={e => setManager(e.target.value)}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-400">사업자번호</span>
              <input
                value={businessNo}
                onChange={e => setBusinessNo(e.target.value)}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono"
              />
            </label>
            <div className="sm:col-span-2 text-[11px] text-gray-500 pt-4">
              {client.representative && `대표 ${client.representative} · `}
              {client.phone && `전화 ${client.phone} · `}
              {relatedSummary(client.relatedCounts)}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {dirty && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '저장 중…' : '수정 저장'}
              </button>
            )}
            <button
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DuplicateClientsAdmin() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [survivorByGroup, setSurvivorByGroup] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = q ?? search;
      const res = await fetch(`/api/admin/clients/duplicates?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '불러오기 실패');
      setGroups(data.groups ?? []);
      setSelectedGroupId(prev => {
        if (prev && data.groups?.some((g: DuplicateGroup) => g.id === prev)) return prev;
        return data.groups?.[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const survivorId = selectedGroup
    ? survivorByGroup[selectedGroup.id] ?? selectedGroup.clients[0]?.id
    : null;

  const handleMerge = async () => {
    if (!selectedGroup || !survivorId) return;
    const duplicateIds = selectedGroup.clients.map(c => c.id).filter(id => id !== survivorId);
    if (duplicateIds.length === 0) {
      alert('병합할 다른 항목이 없습니다.');
      return;
    }
    const survivor = selectedGroup.clients.find(c => c.id === survivorId);
    if (!confirm(
      `"${survivor?.companyName}"을(를) 정본으로 남기고 ${duplicateIds.length}건을 병합·삭제할까요?\n연결 데이터는 정본으로 옮깁니다.`,
    )) return;

    setMerging(true);
    try {
      const res = await fetch('/api/admin/clients/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survivorId, duplicateIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '병합 실패');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '병합하지 못했습니다.');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-black text-gray-900">수임처 중복 관리</h1>
        <p className="text-sm text-gray-600 mt-1">
          엑셀 import로 생긴 중복·유사 상호를 확인하고 수정·병합·삭제할 수 있습니다. (관리자 전용)
        </p>

        <form
          className="mt-4 flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            void load(search);
          }}
        >
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="업체명·사업자번호·담당자로 필터"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
          />
          <button
            type="submit"
            className="shrink-0 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
          >
            검색
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-gray-400">중복 그룹 분석 중…</p>
        ) : groups.length === 0 ? (
          <p className="mt-8 text-sm text-gray-500 rounded-xl border border-gray-100 bg-white px-4 py-8 text-center">
            {search.trim() ? '검색 조건에 맞는 중복 그룹이 없습니다.' : '중복으로 보이는 수임처 그룹이 없습니다.'}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-4 items-start">
            <aside className="space-y-1 max-h-[calc(100vh-12rem)] overflow-y-auto">
              <p className="text-xs font-bold text-gray-500 px-1 pb-2">
                중복 그룹 {groups.length}건
              </p>
              {groups.map(group => {
                const active = group.id === selectedGroupId;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                      active
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-100 bg-white hover:border-blue-200'
                    }`}
                  >
                    <span className="text-[10px] font-bold text-orange-700 block">
                      {REASON_LABEL[group.reason]}
                    </span>
                    <span className="text-sm font-bold text-gray-900 line-clamp-2">
                      {group.clients.map(c => c.companyName).join(' / ')}
                    </span>
                    <span className="text-[10px] text-gray-400">{group.clients.length}건</span>
                  </button>
                );
              })}
            </aside>

            <section className="space-y-4">
              {selectedGroup && (
                <>
                  <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-orange-700">{REASON_LABEL[selectedGroup.reason]}</p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        정본으로 남길 항목을 선택한 뒤 병합하면, 나머지는 삭제되고 연결 데이터는 정본으로 옮겨집니다.
                      </p>
                    </div>
                    {selectedGroup.clients.length >= 2 && (
                      <button
                        type="button"
                        disabled={merging}
                        onClick={() => void handleMerge()}
                        className="shrink-0 px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-50"
                      >
                        {merging ? '병합 중…' : `${selectedGroup.clients.length - 1}건 병합`}
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {selectedGroup.clients.map(client => (
                      <ClientRow
                        key={client.id}
                        client={client}
                        groupId={selectedGroup.id}
                        isSurvivor={client.id === survivorId}
                        onSelectSurvivor={() =>
                          setSurvivorByGroup(prev => ({ ...prev, [selectedGroup.id]: client.id }))
                        }
                        onSaved={() => void load()}
                        onDeleted={() => void load()}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
