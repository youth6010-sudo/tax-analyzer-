'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPortalClients, hydratePortal } from '@/app/utils/portalStore';
import type { ClientRecord } from '@/app/types/client';
import {
  CHECKLIST_TAX_OPTIONS,
  type ChecklistTaxType,
  type PersonalChecklistDto,
  formatCalendarCreatedAt,
} from '@/app/types/calendar';
import { filingTargets, type FilingTaxId } from '@/app/utils/filingCheck';
import { MANAGER_DISPLAY_ORDER } from '@/app/utils/clientsGrouping';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import ScopedClientSearch from '@/app/components/calendar/ScopedClientSearch';
import { useIsMasterUser } from '@/app/utils/useIsMasterUser';
import { WEEKDAY_OPTIONS, INTERVAL_OPTIONS, previewRepeatCount, type RepeatMode, type RepeatIntervalKind } from '@/lib/calendarRepeat';

type Props = {
  onCreated?: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
  onCancel?: () => void;
  defaultClientId?: string;
  editItem?: PersonalChecklistDto | null;
  inModal?: boolean;
};

function checklistTaxToFilingTax(taxType: Exclude<ChecklistTaxType, 'other'>): FilingTaxId {
  return taxType;
}

function clientsForTaxType(clients: ClientRecord[], taxType: Exclude<ChecklistTaxType, 'other'>): ClientRecord[] {
  return filingTargets(clients, checklistTaxToFilingTax(taxType))
    .filter(c => c.status !== 'churned')
    .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '', 'ko'));
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-[5.5rem] shrink-0 pt-2 text-xs font-semibold leading-snug text-slate-600">
        {label}
        {required && <span className="text-red-500" aria-hidden> *</span>}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function PersonalChecklistAddForm({
  onCreated,
  onUpdated,
  onDeleted,
  onCancel,
  defaultClientId,
  editItem = null,
  inModal,
}: Props) {
  const isEdit = Boolean(editItem);
  const isMaster = useIsMasterUser();

  const [taxType, setTaxType] = useState<ChecklistTaxType | ''>('');
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [dueDate, setDueDate] = useState('');
  const [repeatOn, setRepeatOn] = useState(false);
  const [repeatFrom, setRepeatFrom] = useState('');
  const [repeatTo, setRepeatTo] = useState('');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('weekdays');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [interval, setIntervalKind] = useState<RepeatIntervalKind>('weekly');
  const [everyDays, setEveryDays] = useState(3);
  const [reflectInNotes, setReflectInNotes] = useState(false);
  const [assigneeNames, setAssigneeNames] = useState<string[]>([]);
  const [memoDraft, setMemoDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');

  useEffect(() => {
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const name = (d as { user?: { name?: string } })?.user?.name || '';
        setCurrentUser(name);
      })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    if (isMaster === null) return;
    hydratePortal();
    setClientsLoading(true);
    const url = isMaster ? '/api/clients' : '/api/clients?mine=1';
    fetch(url, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setAllClients((d?.clients as ClientRecord[]) ?? getPortalClients()))
      .catch(() => setAllClients(getPortalClients()))
      .finally(() => setClientsLoading(false));
  }, [isMaster]);

  useEffect(() => {
    if (editItem) {
      setTaxType(editItem.taxType);
      setTitle(editItem.title);
      setClientId(editItem.clientId || '');
      setDueDate(editItem.dueDate || '');
      setRepeatOn(false);
      setReflectInNotes(editItem.reflectInNotes);
      setAssigneeNames(editItem.assigneeNames ?? []);
      setMemoDraft('');
      return;
    }
    setTaxType('');
    setTitle('');
    setClientId(defaultClientId || '');
    setDueDate('');
    setRepeatOn(false);
    setRepeatFrom('');
    setRepeatTo('');
    setRepeatMode('weekdays');
    setWeekdays([1, 2, 3, 4, 5]);
    setIntervalKind('weekly');
    setEveryDays(3);
    setReflectInNotes(false);
    setAssigneeNames([]);
    setMemoDraft('');
  }, [editItem, defaultClientId]);

  const isOwner = !editItem || !currentUser || editItem.ownerName === currentUser;
  const staffOptions = useMemo(
    () => MANAGER_DISPLAY_ORDER.filter(n => n !== (editItem?.ownerName || currentUser)),
    [editItem?.ownerName, currentUser],
  );

  const toggleAssignee = (name: string) => {
    setAssigneeNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name],
    );
  };

  const toggleWeekday = (id: number) => {
    setWeekdays(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id].sort((a, b) => a - b),
    );
  };

  const previewCount = useMemo(
    () =>
      !isEdit && repeatOn
        ? previewRepeatCount({
            from: repeatFrom,
            to: repeatTo,
            mode: repeatMode,
            weekdays,
            interval,
            everyDays,
          })
        : null,
    [isEdit, repeatOn, repeatFrom, repeatTo, repeatMode, weekdays, interval, everyDays],
  );

  const clients = useMemo(() => {
    if (!taxType || taxType === 'other') {
      return allClients
        .filter(c => c.status !== 'churned')
        .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '', 'ko'));
    }
    return clientsForTaxType(allClients, taxType);
  }, [allClients, taxType]);

  useEffect(() => {
    if (!clientId) return;
    if (!clients.some(c => c.id === clientId)) setClientId('');
  }, [clients, clientId]);

  const handleTaxTypeChange = (next: ChecklistTaxType | '') => {
    setTaxType(next);
    if (!isEdit) setClientId('');
  };

  const handleDelete = async () => {
    if (!editItem) return;
    if (!confirm(`"${editItem.title}" 항목을 삭제할까요?`)) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/calendar/personal-checklist/${editItem.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '삭제 실패');
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (isOwner) {
      if (!taxType) {
        window.alert('구분을 선택해주세요.');
        return;
      }
      if (!title.trim()) {
        window.alert('체크리스트 내용을 입력해주세요.');
        return;
      }
      if (!isEdit && repeatOn) {
        if (!repeatFrom.trim() || !repeatTo.trim()) {
          window.alert('반복 기간(시작·종료)을 입력해주세요.');
          return;
        }
        if (repeatMode === 'weekdays' && weekdays.length === 0) {
          window.alert('반복할 요일을 선택해주세요.');
          return;
        }
        if (repeatMode === 'interval' && interval === 'custom' && (!everyDays || everyDays < 1)) {
          window.alert('반복 주기(일)를 입력해주세요.');
          return;
        }
      } else if (!dueDate.trim()) {
        window.alert('마감일을 입력해주세요.');
        return;
      }
    } else if (isEdit && !memoDraft.trim()) {
      window.alert('추가할 메모를 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = isEdit
      ? {
          ...(isOwner
            ? {
                title,
                taxType,
                clientId: clientId || null,
                dueDate,
                reflectInNotes,
                assigneeNames,
              }
            : {}),
          ...(memoDraft.trim() ? { addMemo: memoDraft.trim() } : {}),
        }
      : repeatOn
        ? {
            title,
            taxType,
            clientId: clientId || null,
            reflectInNotes,
            assigneeNames,
            ...(memoDraft.trim() ? { memo: memoDraft.trim() } : {}),
            repeat: {
              from: repeatFrom,
              to: repeatTo,
              mode: repeatMode,
              weekdays: repeatMode === 'weekdays' ? weekdays : undefined,
              interval: repeatMode === 'interval' ? interval : undefined,
              everyDays: repeatMode === 'interval' && interval === 'custom' ? everyDays : undefined,
            },
          }
        : {
            title,
            taxType,
            clientId: clientId || null,
            dueDate,
            reflectInNotes,
            assigneeNames,
            ...(memoDraft.trim() ? { memo: memoDraft.trim() } : {}),
          };
    try {
      const res = await fetch(
        isEdit && editItem
          ? `/api/calendar/personal-checklist/${editItem.id}`
          : '/api/calendar/personal-checklist',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error || '저장 실패';
        if (msg.includes('마감')) {
          window.alert('마감일을 입력해주세요.');
          return;
        }
        throw new Error(msg);
      }
      if (!isEdit) {
        setTaxType('');
        setTitle('');
        setDueDate('');
        setRepeatOn(false);
        setRepeatFrom('');
        setRepeatTo('');
        setRepeatMode('weekdays');
        setWeekdays([1, 2, 3, 4, 5]);
        setIntervalKind('weekly');
        setEveryDays(3);
        setClientId(defaultClientId || '');
        setReflectInNotes(false);
        setAssigneeNames([]);
        setMemoDraft('');
        onCreated?.();
      } else {
        setMemoDraft('');
        onUpdated?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const wrapperCls = inModal ? 'space-y-3' : 'rounded-lg border border-amber-200 bg-white p-3 space-y-2';

  return (
    <div className={wrapperCls}>
      <FormRow label="구분" required={isOwner}>
        <select
          value={taxType}
          onChange={e => handleTaxTypeChange(e.target.value as ChecklistTaxType | '')}
          className={portalInput + ' w-full text-xs py-1.5'}
          aria-label="구분"
          aria-required={isOwner}
          disabled={!isOwner}
        >
          <option value="">선택</option>
          {CHECKLIST_TAX_OPTIONS.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </FormRow>

      <FormRow label="체크리스트 내용" required={isOwner}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={portalInput + ' w-full text-xs py-1.5'}
          aria-required={isOwner}
          readOnly={!isOwner}
        />
      </FormRow>

      <FormRow label="마감일" required={isOwner}>
        <div className="space-y-2">
          {!isEdit && isOwner && (
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={repeatOn}
                onChange={e => setRepeatOn(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              기간 · 반복 등록
            </label>
          )}
          {!isEdit && repeatOn && isOwner ? (
            <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">시작일</label>
                  <input
                    type="date"
                    value={repeatFrom}
                    onChange={e => setRepeatFrom(e.target.value)}
                    className={portalInput + ' w-full text-xs py-1.5'}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">종료일</label>
                  <input
                    type="date"
                    value={repeatTo}
                    onChange={e => setRepeatTo(e.target.value)}
                    className={portalInput + ' w-full text-xs py-1.5'}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <input
                    type="radio"
                    name="personal-repeat-mode"
                    checked={repeatMode === 'weekdays'}
                    onChange={() => setRepeatMode('weekdays')}
                  />
                  반복 요일
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <input
                    type="radio"
                    name="personal-repeat-mode"
                    checked={repeatMode === 'interval'}
                    onChange={() => setRepeatMode('interval')}
                  />
                  반복 주기
                </label>
              </div>

              {repeatMode === 'weekdays' ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-600">요일 선택</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_OPTIONS.map(d => {
                      const on = weekdays.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleWeekday(d.id)}
                          className={`h-7 w-7 rounded-full text-[11px] font-bold ring-1 ${
                            on
                              ? 'bg-[#1e3a8a] text-white ring-[#1e3a8a]'
                              : 'bg-white text-slate-500 ring-slate-200'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-600">주기 선택</p>
                  <div className="flex flex-wrap gap-1.5">
                    {INTERVAL_OPTIONS.map(opt => {
                      const on = interval === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setIntervalKind(opt.id)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ring-1 ${
                            on
                              ? 'bg-[#1e3a8a] text-white ring-[#1e3a8a]'
                              : 'bg-white text-slate-600 ring-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {interval === 'custom' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={everyDays}
                        onChange={e => setEveryDays(Number(e.target.value) || 1)}
                        className={portalInput + ' w-20 text-xs py-1.5'}
                      />
                      <span className="text-xs text-slate-600">일마다</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">시작일부터 선택한 주기로 생성됩니다.</p>
                </div>
              )}

              {previewCount != null && (
                <p className="text-[11px] text-slate-500">
                  선택한 기간·조건으로{' '}
                  <span className="font-bold text-slate-700">{previewCount}건</span> 등록됩니다.
                </p>
              )}
            </div>
          ) : (
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={portalInput + ' w-full text-xs py-1.5'}
              aria-required={isOwner}
              readOnly={!isOwner}
            />
          )}
        </div>
      </FormRow>

      {isOwner && (
        <>
          <FormRow label="수임처">
            <ScopedClientSearch
              candidates={clients}
              clientId={clientId}
              onSelect={setClientId}
              loading={clientsLoading}
              placeholder="검색"
              emptyHint={
                !taxType
                  ? '구분을 먼저 선택하세요'
                  : taxType === 'other'
                    ? '검색 결과 없음'
                    : '해당 세목 범위에서 검색 결과 없음'
              }
            />
          </FormRow>

          <FormRow label="협업자">
            <div className="flex flex-wrap gap-1.5">
              {staffOptions.map(name => {
                const on = assigneeNames.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleAssignee(name)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      on
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              선택한 협업자 개인 체크리스트에도 같은 항목이 표시됩니다.
            </p>
          </FormRow>

          <label className="flex items-start gap-2 pl-[6.5rem] text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={reflectInNotes}
              onChange={e => setReflectInNotes(e.target.checked)}
              className="mt-0.5"
            />
            <span>업체별 특이사항에 반영</span>
          </label>
        </>
      )}

      {!isOwner && editItem && (
        <div className="pl-[6.5rem] space-y-1 text-xs text-slate-600">
          <p>
            작성자 <span className="font-semibold text-slate-800">{editItem.ownerName}</span>
          </p>
          {(editItem.assigneeNames?.length ?? 0) > 0 && (
            <p>협업 {editItem.assigneeNames.join(', ')}</p>
          )}
        </div>
      )}

      <FormRow label="메모">
        <div className="space-y-2">
          {isEdit && (editItem?.memos?.length ?? 0) > 0 && (
            <ul className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-2">
              {editItem!.memos.map(m => (
                <li key={m.id} className="text-xs leading-snug">
                  <span className="font-semibold text-slate-700">{m.authorName}</span>
                  <span className="ml-1.5 text-[10px] text-slate-400">
                    {formatCalendarCreatedAt(m.createdAt)}
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={memoDraft}
            onChange={e => setMemoDraft(e.target.value)}
            rows={2}
            placeholder={isEdit ? '메모 추가…' : '메모 (선택)'}
            className={portalInput + ' w-full resize-y text-xs py-1.5'}
          />
        </div>
      </FormRow>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {isEdit && editItem?.createdAt && (
        <p className="text-xs text-slate-500 pl-[6.5rem]">
          등록: {editItem.ownerName} · {formatCalendarCreatedAt(editItem.createdAt)}
        </p>
      )}

      <div className="flex items-center gap-2">
        {isEdit && isOwner && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className={portalBtnPrimary + ' text-xs py-1.5' + (isEdit ? ' flex-1' : '')}
        >
          {saving
            ? '저장 중…'
            : isEdit
              ? isOwner
                ? '저장'
                : '메모 추가'
              : repeatOn && previewCount
                ? `체크리스트 ${previewCount}건 추가`
                : '체크리스트 추가'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={portalBtnSecondary + ' text-xs py-1.5'}>
            취소
          </button>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-slate-400">
          <span className="text-red-500">*</span> 필수입력
        </span>
      </div>
    </div>
  );
}
