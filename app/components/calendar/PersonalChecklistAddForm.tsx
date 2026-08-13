'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPortalClients, hydratePortal } from '@/app/utils/portalStore';
import type { ClientRecord } from '@/app/types/client';
import {
  CHECKLIST_TAX_OPTIONS,
  type PersonalChecklistAttachment,
  type ChecklistTaxType,
  type PersonalChecklistDto,
  type PersonalChecklistMemo,
  formatCalendarCreatedAt,
  formatCheckoffCompletedAt,
  forcedAssigneesForTaxType,
  isRoutedRequestTaxType,
  isSuppliesOrderTaxType,
  isImprovementRequestTaxType,
  isLeaveRequestTaxType,
  SUPPLIES_ORDER_ASSIGNEE,
  IMPROVEMENT_REQUEST_ASSIGNEES,
} from '@/app/types/calendar';
import LeaveApplyForm from '@/app/components/leave/LeaveApplyForm';
import { filingTargets, type FilingTaxId } from '@/app/utils/filingCheck';
import { MANAGER_DISPLAY_ORDER } from '@/app/utils/clientsGrouping';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import ScopedClientSearch from '@/app/components/calendar/ScopedClientSearch';
import { useIsMasterUser } from '@/app/utils/useIsMasterUser';
import { getManagerMatchNames, managerNamesMatch } from '@/app/utils/managerMatch';
import {
  WEEKDAY_OPTIONS,
  INTERVAL_OPTIONS,
  MONTH_DAY_OPTIONS,
  MAX_REPEAT_DATES,
  TAX_DEADLINE_REPEAT_HINTS,
  previewRepeatCount,
  isTaxDeadlineRepeatType,
  openEndedRepeatTo,
  todayIsoLocal,
  type RepeatMode,
  type RepeatIntervalKind,
} from '@/lib/calendarRepeat';

type Props = {
  onCreated?: () => void;
  /** 수정 저장 후 — item이 있으면 모달 유지·내용 갱신 */
  onUpdated?: (item?: PersonalChecklistDto) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
  /** 처리완료 토글 후 목록·모달 갱신 */
  onCheckoffChange?: (item?: PersonalChecklistDto) => void;
  defaultClientId?: string;
  /** 신규 등록 시 기한 초기값 (YYYY-MM-DD) */
  defaultDueDate?: string;
  editItem?: PersonalChecklistDto | null;
  inModal?: boolean;
};

type FilingChecklistTax = Exclude<
  ChecklistTaxType,
  'other' | 'supplies' | 'improvement' | 'leave'
>;

function checklistTaxToFilingTax(taxType: FilingChecklistTax): FilingTaxId {
  return taxType;
}

function clientsForTaxType(clients: ClientRecord[], taxType: FilingChecklistTax): ClientRecord[] {
  return filingTargets(clients, checklistTaxToFilingTax(taxType))
    .sort((a, b) => {
      const ac = a.status === 'churned' ? 1 : 0;
      const bc = b.status === 'churned' ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
    });
}

function ensureForcedAssignees(
  taxType: ChecklistTaxType | '',
  names: string[],
  owner: string,
): string[] {
  if (isSuppliesOrderTaxType(taxType)) {
    // 비품은 다야만 — 이전 구분(시스템개선 등)에서 남은 협업자 이어받지 않음
    if (managerNamesMatch(owner, SUPPLIES_ORDER_ASSIGNEE)) return [];
    return [SUPPLIES_ORDER_ASSIGNEE];
  }
  if (isImprovementRequestTaxType(taxType)) {
    // 시스템개선은 리아·찰리만 고정 (이전 선택값 무시)
    return IMPROVEMENT_REQUEST_ASSIGNEES.filter(n => !managerNamesMatch(n, owner));
  }
  const forced = forcedAssigneesForTaxType(taxType);
  let out = names.filter(n => n !== owner);
  if (forced.length === 0) return out;
  for (const name of forced) {
    if (name === owner) continue;
    if (!out.includes(name)) out = [...out, name];
  }
  return out;
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
  onCheckoffChange,
  defaultClientId,
  defaultDueDate,
  editItem = null,
  inModal,
}: Props) {
  const isEdit = Boolean(editItem);
  const isMaster = useIsMasterUser();

  const [taxType, setTaxType] = useState<ChecklistTaxType | ''>('');
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [dueDate, setDueDate] = useState(defaultDueDate || '');
  const [dueTime, setDueTime] = useState('');
  const [repeatOn, setRepeatOn] = useState(false);
  const [periodOn, setPeriodOn] = useState(true);
  const [repeatFrom, setRepeatFrom] = useState('');
  const [repeatTo, setRepeatTo] = useState('');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('weekdays');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [interval, setIntervalKind] = useState<RepeatIntervalKind>('weekly');
  const [everyDays, setEveryDays] = useState(3);
  const [monthDay, setMonthDay] = useState(10);
  const [reflectInNotes, setReflectInNotes] = useState(false);
  const [assigneeNames, setAssigneeNames] = useState<string[]>([]);
  const [memoDraft, setMemoDraft] = useState('');
  const [memoAttachments, setMemoAttachments] = useState<PersonalChecklistAttachment[]>([]);
  const [memos, setMemos] = useState<PersonalChecklistMemo[]>([]);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingMemoBody, setEditingMemoBody] = useState('');
  const [memoBusy, setMemoBusy] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const [myCheckoff, setMyCheckoff] = useState(false);
  const [checkoffBusy, setCheckoffBusy] = useState(false);
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
    const url = isMaster
      ? '/api/clients?includeChurned=1'
      : '/api/clients?mine=1&includeChurned=1';
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
      setDueTime(editItem.dueTime || '');
      setRepeatOn(false);
      setReflectInNotes(editItem.reflectInNotes);
      setAssigneeNames(
        isRoutedRequestTaxType(editItem.taxType)
          ? ensureForcedAssignees(editItem.taxType, editItem.assigneeNames ?? [], editItem.ownerName)
          : (editItem.assigneeNames ?? []),
      );
      setMyCheckoff(editItem.myCheckoff ?? false);
      setMemos(editItem.memos ?? []);
      setEditingMemoId(null);
      setEditingMemoBody('');
      setMemoDraft('');
      setMemoAttachments([]);
      return;
    }
    setTaxType('');
    setTitle('');
    setClientId(defaultClientId || '');
    setDueDate(defaultDueDate || '');
    setDueTime('');
    setRepeatOn(false);
    setPeriodOn(true);
    setRepeatFrom('');
    setRepeatTo('');
    setRepeatMode('weekdays');
    setWeekdays([1, 2, 3, 4, 5]);
    setIntervalKind('weekly');
    setEveryDays(3);
    setMonthDay(10);
    setReflectInNotes(false);
    setAssigneeNames([]);
    setMyCheckoff(false);
    setMemos([]);
    setEditingMemoId(null);
    setEditingMemoBody('');
    setMemoDraft('');
    setMemoAttachments([]);
  }, [editItem, defaultClientId, defaultDueDate]);

  const isOwner = !editItem || !currentUser || managerNamesMatch(editItem.ownerName, currentUser);
  const staffOptions = useMemo(() => {
    const owner = editItem?.ownerName || currentUser;
    return MANAGER_DISPLAY_ORDER.filter(n => {
      if (owner && managerNamesMatch(n, owner)) return false;
      // 시스템 개선: 다야는 협업자 선택에서 제외
      if (taxType === 'improvement' && managerNamesMatch(n, '다야')) return false;
      return true;
    });
  }, [editItem?.ownerName, currentUser, taxType]);

  const canEditMemo = (m: PersonalChecklistMemo) => {
    if (!currentUser) return false;
    if (isOwner) return true;
    return managerNamesMatch(m.authorName, currentUser);
  };

  const patchMemo = async (body: Record<string, unknown>) => {
    if (!editItem) return;
    setMemoBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/calendar/personal-checklist/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '메모 저장 실패');
      const next = (data as { item?: PersonalChecklistDto }).item;
      if (next?.memos) setMemos(next.memos);
      setEditingMemoId(null);
      setEditingMemoBody('');
      setMemoDraft('');
      setMemoAttachments([]);
      onUpdated?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '메모 저장 실패');
    } finally {
      setMemoBusy(false);
    }
  };

  const saveMemoEdit = async () => {
    if (!editingMemoId) return;
    const body = editingMemoBody.trim();
    if (!body) {
      window.alert('메모 내용을 입력해주세요.');
      return;
    }
    await patchMemo({ updateMemo: { id: editingMemoId, body } });
  };

  const deleteMemo = async (memoId: string) => {
    if (!confirm('이 메모를 삭제할까요?')) return;
    await patchMemo({ deleteMemo: memoId });
  };

  const onPickMemoImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (picked.length === 0) {
      setError('이미지 파일만 올릴 수 있습니다.');
      return;
    }
    const next = await Promise.all(
      picked.map(
        file =>
          new Promise<PersonalChecklistAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: crypto.randomUUID(),
                name: file.name,
                contentType: file.type || 'image/*',
                dataUrl: String(reader.result ?? ''),
              });
            reader.onerror = () => reject(new Error(`${file.name} 이미지를 읽지 못했습니다.`));
            reader.readAsDataURL(file);
          }),
      ),
    ).catch(err => {
      setError(err instanceof Error ? err.message : '이미지 업로드 실패');
      return null;
    });
    if (!next) return;
    setError('');
    setMemoAttachments(prev => [...prev, ...next]);
  };

  const toggleAssignee = (name: string) => {
    const forced = forcedAssigneesForTaxType(taxType);
    if (forced.includes(name)) return;
    setAssigneeNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name],
    );
  };

  const toggleWeekday = (id: number) => {
    setWeekdays(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id].sort((a, b) => a - b),
    );
  };

  const repeatExpandInput = useMemo(() => {
    if (isEdit || !repeatOn) return null;
    const from = periodOn ? repeatFrom : todayIsoLocal();
    const to = periodOn ? repeatTo : openEndedRepeatTo(from);
    if (!from || !to) return null;
    return {
      from,
      to,
      mode: repeatMode,
      weekdays,
      interval,
      everyDays,
      monthDay,
      taxType: isTaxDeadlineRepeatType(taxType) ? taxType : undefined,
      stopAtMax: !periodOn,
    };
  }, [
    isEdit,
    repeatOn,
    periodOn,
    repeatFrom,
    repeatTo,
    repeatMode,
    weekdays,
    interval,
    everyDays,
    monthDay,
    taxType,
  ]);

  const previewCount = useMemo(
    () => (repeatExpandInput ? previewRepeatCount(repeatExpandInput) : null),
    [repeatExpandInput],
  );

  const canUseTaxDeadline = isTaxDeadlineRepeatType(taxType);

  const clients = useMemo(() => {
    if (!taxType || taxType === 'other' || isRoutedRequestTaxType(taxType)) {
      return [...allClients].sort((a, b) => {
        const ac = a.status === 'churned' ? 1 : 0;
        const bc = b.status === 'churned' ? 1 : 0;
        if (ac !== bc) return ac - bc;
        return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
      });
    }
    return clientsForTaxType(allClients, taxType as FilingChecklistTax);
  }, [allClients, taxType]);

  useEffect(() => {
    if (!clientId) return;
    if (!clients.some(c => c.id === clientId)) setClientId('');
  }, [clients, clientId]);

  const isRouted = isRoutedRequestTaxType(taxType);
  const isSupplies = isSuppliesOrderTaxType(taxType);
  const isImprovement = isImprovementRequestTaxType(taxType);
  const isLeave = isLeaveRequestTaxType(taxType);
  const checkoffNames =
    editItem?.participants?.length
      ? editItem.participants
      : isImprovement
        ? [...forcedAssigneesForTaxType('improvement')]
        : isSupplies
          ? [...forcedAssigneesForTaxType('supplies')]
          : isRouted
            ? (editItem?.assigneeNames ?? [])
            : [];
  const userAliases = currentUser ? getManagerMatchNames(currentUser) : [];
  const canCheckoff =
    isEdit &&
    isRouted &&
    userAliases.some(a => checkoffNames.some(n => managerNamesMatch(n, a)));

  const isNameDone = (name: string) => {
    if (userAliases.some(a => managerNamesMatch(name, a))) return myCheckoff;
    if (editItem?.checkoffs?.[name]) return true;
    return Object.entries(editItem?.checkoffs ?? {}).some(
      ([n, done]) => done && managerNamesMatch(n, name),
    );
  };

  const improvementSomeoneDone =
    isImprovement
    && (
      checkoffNames.some(n => isNameDone(n))
      || (editItem?.checkoffDone ?? 0) >= 1
      || Boolean(editItem?.completed)
    );

  const toggleRoutedCheckoff = async (completed: boolean) => {
    if (!editItem || !canCheckoff) return;
    setCheckoffBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/calendar/personal-checklist/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '처리 상태 변경 실패');
      setMyCheckoff(completed);
      const next = (data as { item?: PersonalChecklistDto }).item;
      onCheckoffChange?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 상태 변경 실패');
    } finally {
      setCheckoffBusy(false);
    }
  };

  const handleTaxTypeChange = (next: ChecklistTaxType | '') => {
    setTaxType(next);
    if (!isEdit) setClientId('');
    const owner = editItem?.ownerName || currentUser;
    if (isRoutedRequestTaxType(next)) {
      setRepeatOn(false);
      setDueDate('');
      // 구분별 고정 협업자만 적용 (이전 구분 선택값 이어받지 않음)
      setAssigneeNames(ensureForcedAssignees(next, [], owner));
    } else if (isRoutedRequestTaxType(taxType) || isLeaveRequestTaxType(next) || !next) {
      // 비품·시스템개선 → 일반 구분으로 바꿀 때 고정 협업자 잔존 제거
      setAssigneeNames([]);
    }
    if (!isTaxDeadlineRepeatType(next) && repeatMode === 'taxDeadline') {
      setRepeatMode('weekdays');
    }
  };

  const handleDelete = async () => {
    if (!editItem) return;
    let series = false;
    if (editItem.repeatSeriesId) {
      const all = confirm(
        `"${editItem.title}"\n\n같은 반복 일정 전체를 삭제할까요?\n\n확인 = 전체 삭제\n취소 = 이 일정만 삭제할지 이어서 묻습니다.`,
      );
      if (all) {
        series = true;
      } else if (!confirm(`"${editItem.title}" 이 일정만 삭제할까요?`)) {
        return;
      }
    } else if (!confirm(`"${editItem.title}" 항목을 삭제할까요?`)) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const qs = series ? '?scope=series' : '';
      const res = await fetch(`/api/calendar/personal-checklist/${editItem.id}${qs}`, {
        method: 'DELETE',
      });
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
    if (isLeaveRequestTaxType(taxType)) {
      return;
    }
    if (isOwner) {
      if (!taxType) {
        window.alert('구분을 선택해주세요.');
        return;
      }
      if (!title.trim()) {
        window.alert('체크리스트 내용을 입력해주세요.');
        return;
      }
      if (!isRoutedRequestTaxType(taxType)) {
        if (!isEdit && repeatOn) {
          if (periodOn && (!repeatFrom.trim() || !repeatTo.trim())) {
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
          if (repeatMode === 'interval' && interval === 'monthly' && (!monthDay || monthDay < 1 || monthDay > 31)) {
            window.alert('매월 반복할 일자를 선택해주세요.');
            return;
          }
          if (repeatMode === 'taxDeadline' && !isTaxDeadlineRepeatType(taxType)) {
            window.alert('세목 마감일은 원천세·부가세·종소세·법인세 구분에서만 사용할 수 있습니다.');
            return;
          }
        } else if (!dueDate.trim()) {
          window.alert('마감일을 입력해주세요.');
          return;
        }
      }
    } else if (isEdit && !memoDraft.trim() && memoAttachments.length === 0) {
      window.alert('추가할 메모나 이미지를 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    const ownerForAssignees = editItem?.ownerName || currentUser;
    const finalAssignees = isRoutedRequestTaxType(taxType)
      ? ensureForcedAssignees(taxType, assigneeNames, ownerForAssignees)
      : assigneeNames;
    const payload = isEdit
      ? {
          ...(isOwner
            ? {
                title,
                taxType,
                clientId: isRoutedRequestTaxType(taxType) ? null : (clientId || null),
                dueDate: isRoutedRequestTaxType(taxType) ? '' : dueDate,
                dueTime: isRoutedRequestTaxType(taxType) ? '' : dueTime,
                reflectInNotes: isRoutedRequestTaxType(taxType) ? false : reflectInNotes,
                assigneeNames: finalAssignees,
              }
            : {}),
          ...(memoDraft.trim() || memoAttachments.length > 0
            ? { addMemo: { body: memoDraft.trim(), attachments: memoAttachments } }
            : {}),
        }
      : !isRoutedRequestTaxType(taxType) && repeatOn
        ? {
            title,
            taxType,
            clientId: clientId || null,
            dueTime: dueTime || '',
            reflectInNotes,
            assigneeNames: finalAssignees,
            ...(memoDraft.trim() || memoAttachments.length > 0
              ? { memo: { body: memoDraft.trim(), attachments: memoAttachments } }
              : {}),
            repeat: (() => {
              const from = periodOn ? repeatFrom : todayIsoLocal();
              const to = periodOn ? repeatTo : openEndedRepeatTo(from);
              return {
                from,
                to,
                mode: repeatMode,
                weekdays: repeatMode === 'weekdays' ? weekdays : undefined,
                interval: repeatMode === 'interval' ? interval : undefined,
                everyDays: repeatMode === 'interval' && interval === 'custom' ? everyDays : undefined,
                monthDay: repeatMode === 'interval' && interval === 'monthly' ? monthDay : undefined,
                taxType:
                  repeatMode === 'taxDeadline' && isTaxDeadlineRepeatType(taxType) ? taxType : undefined,
                stopAtMax: !periodOn,
              };
            })(),
          }
        : {
            title,
            taxType,
            clientId: isRoutedRequestTaxType(taxType) ? null : (clientId || null),
            dueDate: isRoutedRequestTaxType(taxType) ? '' : dueDate,
            dueTime: isRoutedRequestTaxType(taxType) ? '' : dueTime,
            reflectInNotes: isRoutedRequestTaxType(taxType) ? false : reflectInNotes,
            assigneeNames: finalAssignees,
            ...(memoDraft.trim() || memoAttachments.length > 0
              ? { memo: { body: memoDraft.trim(), attachments: memoAttachments } }
              : {}),
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
        setPeriodOn(true);
        setRepeatFrom('');
        setRepeatTo('');
        setRepeatMode('weekdays');
        setWeekdays([1, 2, 3, 4, 5]);
        setIntervalKind('weekly');
        setEveryDays(3);
        setMonthDay(10);
        setClientId(defaultClientId || '');
        setReflectInNotes(false);
        setAssigneeNames([]);
        setMemoDraft('');
        setMemoAttachments([]);
        onCreated?.();
      } else {
        setMemoDraft('');
        setMemoAttachments([]);
        const next = (data as { item?: PersonalChecklistDto }).item;
        if (next?.memos) setMemos(next.memos);
        onUpdated?.(next);
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

      {isLeave && !isEdit ? (
        <LeaveApplyForm
          onCancel={() => setTaxType('')}
          onCreated={async () => {
            setTaxType('');
            onCreated?.();
          }}
        />
      ) : null}

      {!isLeave ? (
      <>
      <FormRow label={isRouted ? '요청 내용' : '체크리스트 내용'} required={isOwner}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={portalInput + ' w-full text-xs py-1.5'}
          aria-required={isOwner}
          readOnly={!isOwner}
          placeholder={
            isSupplies ? '주문할 비품 내용' : isImprovement ? '개선 요청 내용' : undefined
          }
        />
      </FormRow>

      {!isRouted && (
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
              반복 등록
            </label>
          )}
          {!isEdit && repeatOn && isOwner ? (
            <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={periodOn}
                  onChange={e => setPeriodOn(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                시작일·종료일 지정
              </label>
              {periodOn ? (
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
              ) : (
                <p className="text-[10px] text-slate-500">
                  오늘부터 선택한 주기로 최대 {MAX_REPEAT_DATES}건까지 등록합니다.
                </p>
              )}

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
                {canUseTaxDeadline ? (
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="personal-repeat-mode"
                      checked={repeatMode === 'taxDeadline'}
                      onChange={() => setRepeatMode('taxDeadline')}
                    />
                    세목 마감일
                  </label>
                ) : null}
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
              ) : repeatMode === 'taxDeadline' && canUseTaxDeadline ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-600">세목 마감일 기준</p>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    {TAX_DEADLINE_REPEAT_HINTS[taxType]}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    캘린더 세무신고 마감과 동일하게 휴일이면 다음 영업일로 맞춰집니다.
                  </p>
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
                  {interval === 'monthly' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-600">매월</span>
                      <select
                        value={monthDay}
                        onChange={e => setMonthDay(Number(e.target.value) || 1)}
                        className={portalInput + ' w-24 text-xs py-1.5'}
                        aria-label="매월 반복 일자"
                      >
                        {MONTH_DAY_OPTIONS.map(day => (
                          <option key={day} value={day}>
                            {day}일
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-400">해당 월에 없는 일자는 말일로 맞춰집니다.</span>
                    </div>
                  )}
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
                  {interval !== 'monthly' && (
                    <p className="text-[10px] text-slate-400">시작일부터 선택한 주기로 생성됩니다.</p>
                  )}
                </div>
              )}

              {previewCount != null && (
                <p className="text-[11px] text-slate-500">
                  {periodOn ? '선택한 기간·조건으로' : '오늘부터 선택한 조건으로'}{' '}
                  <span className="font-bold text-slate-700">{previewCount}건</span> 등록됩니다
                  {!periodOn ? ` (최대 ${MAX_REPEAT_DATES}건)` : ''}.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <span className="text-[11px] font-semibold text-slate-600">시각</span>
                <input
                  type="time"
                  step={60}
                  value={dueTime}
                  onChange={e => setDueTime((e.target.value || '').slice(0, 5))}
                  className={portalInput + ' w-[7.5rem] text-xs py-1.5'}
                  title="모든 반복일에 동일 적용 (비우면 종일)"
                  readOnly={!isOwner}
                />
                {dueTime ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
                    onClick={() => setDueTime('')}
                    disabled={!isOwner}
                  >
                    종일
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">비우면 종일</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className={portalInput + ' min-w-[10rem] flex-1 text-xs py-1.5'}
                aria-required={isOwner}
                readOnly={!isOwner}
              />
              <input
                type="time"
                step={60}
                value={dueTime}
                onChange={e => setDueTime((e.target.value || '').slice(0, 5))}
                className={portalInput + ' w-[7.5rem] text-xs py-1.5'}
                title="시각 (선택 — 비우면 종일)"
                readOnly={!isOwner}
              />
              {dueTime ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
                  onClick={() => setDueTime('')}
                  disabled={!isOwner}
                >
                  종일
                </button>
              ) : null}
            </div>
          )}
        </div>
      </FormRow>
      )}

      {isRouted && (
        <p className="pl-[6.5rem] text-[11px] text-slate-500">
          {isSupplies
            ? '캘린더에는 표시되지 않으며, 캘린더의 비품 주문 목록 탭에서 요청일·주문일을 확인할 수 있습니다.'
            : '캘린더에는 표시되지 않으며, 캘린더의 시스템 개선 요청 탭에서 요청·처리 현황을 확인할 수 있습니다.'}
        </p>
      )}

      {isOwner && (
        <>
          {!isRouted && (
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
          )}

          <FormRow label="협업자">
            <div className="flex flex-wrap gap-1.5">
              {(isSupplies || isImprovement
                ? staffOptions.filter(name =>
                    forcedAssigneesForTaxType(taxType).some(f => managerNamesMatch(name, f)),
                  )
                : staffOptions
              ).map(name => {
                const forced = forcedAssigneesForTaxType(taxType).some(f =>
                  managerNamesMatch(name, f),
                );
                const on = forced || assigneeNames.some(a => managerNamesMatch(a, name));
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleAssignee(name)}
                    disabled={forced || isSupplies || isImprovement}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      on
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    } ${forced || isSupplies || isImprovement ? 'cursor-default opacity-90' : ''}`}
                  >
                    {name}
                    {forced ? ' (고정)' : ''}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {isSupplies
                ? '비품 주문 요청은 다야만 협업자로 고정됩니다.'
                : isImprovement
                  ? '시스템 개선 요청은 리아·찰리만 고정 협업자이며, 다야는 제외됩니다. 한 명이 처리하면 완료됩니다.'
                  : '선택한 협업자 개인 체크리스트에도 같은 항목이 표시됩니다.'}
            </p>
          </FormRow>

          {!isRouted && (
          <label className="flex items-start gap-2 pl-[6.5rem] text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={reflectInNotes}
              onChange={e => setReflectInNotes(e.target.checked)}
              className="mt-0.5"
            />
            <span>업체별 특이사항에 반영</span>
          </label>
          )}
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

      {isEdit && isRouted && (
        <FormRow label="처리완료">
          <div className="space-y-2">
            {canCheckoff ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={myCheckoff}
                  disabled={checkoffBusy || saving}
                  onChange={e => void toggleRoutedCheckoff(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                <span>{isSupplies ? '주문·처리 완료' : '처리 완료'}</span>
              </label>
            ) : (
              <p className="pt-1.5 text-xs text-slate-500">
                {isOwner &&
                !(
                  isSupplies &&
                  userAliases.some(a => managerNamesMatch(a, SUPPLIES_ORDER_ASSIGNEE))
                )
                  ? '요청자는 완료 체크할 수 없습니다. 담당 협업자가 처리합니다.'
                  : '이 요청의 처리 담당자가 아닙니다.'}
              </p>
            )}
            {checkoffNames.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                {checkoffNames.map(name => {
                  const done = isNameDone(name);
                  const at =
                    editItem?.checkoffDetails?.[name]?.completedAt
                    ?? Object.entries(editItem?.checkoffDetails ?? {}).find(
                      ([n]) => managerNamesMatch(n, name),
                    )?.[1]?.completedAt;
                  const strike = improvementSomeoneDone && !done;
                  return (
                    <li key={name} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span
                        className={
                          strike
                            ? 'font-semibold text-slate-400 line-through'
                            : done
                              ? 'font-semibold text-emerald-800'
                              : 'font-semibold text-slate-700'
                        }
                      >
                        {name}
                      </span>
                      {done ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-px font-semibold text-emerald-700">
                          완료
                          {at ? ` · ${formatCheckoffCompletedAt(at)}` : ''}
                        </span>
                      ) : strike ? (
                        <span className="rounded bg-slate-100 px-1.5 py-px font-semibold text-slate-400 line-through">
                          미처리
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-px font-semibold text-slate-500">
                          미처리
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </FormRow>
      )}

      <FormRow label="메모">
        <div className="space-y-2">
          {isEdit && memos.length > 0 && (
            <ul className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-2">
              {memos.map(m => {
                const editable = canEditMemo(m);
                const isEditing = editingMemoId === m.id;
                return (
                  <li key={m.id} className="rounded-md bg-white/80 px-2 py-1.5 text-xs leading-snug ring-1 ring-slate-100">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="font-semibold text-[#4b6cb7]">{m.authorName}</span>
                      <span className="text-[10px] text-slate-400">
                        {formatCalendarCreatedAt(m.createdAt)}
                      </span>
                      {editable && !isEditing && (
                        <span className="ml-auto flex gap-1">
                          <button
                            type="button"
                            disabled={memoBusy || saving}
                            onClick={() => {
                              setEditingMemoId(m.id);
                              setEditingMemoBody(m.body);
                            }}
                            className="text-[10px] font-semibold text-slate-500 hover:text-[#4b6cb7] disabled:opacity-50"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={memoBusy || saving}
                            onClick={() => void deleteMemo(m.id)}
                            className="text-[10px] font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-1.5 space-y-1.5">
                        <textarea
                          value={editingMemoBody}
                          onChange={e => setEditingMemoBody(e.target.value)}
                          rows={2}
                          className={portalInput + ' w-full resize-y text-xs py-1.5'}
                          disabled={memoBusy}
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={memoBusy}
                            onClick={() => void saveMemoEdit()}
                            className="rounded-md bg-[#4b6cb7] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                          >
                            {memoBusy ? '저장 중…' : '메모 저장'}
                          </button>
                          <button
                            type="button"
                            disabled={memoBusy}
                            onClick={() => {
                              setEditingMemoId(null);
                              setEditingMemoBody('');
                            }}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 disabled:opacity-50"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{m.body}</p>
                        {(m.attachments?.length ?? 0) > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.attachments!.map(att => (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() => setImagePreview({ url: att.dataUrl, name: att.name })}
                                className="block"
                                title="미리보기"
                              >
                                <img
                                  src={att.dataUrl}
                                  alt={att.name}
                                  className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <textarea
            value={memoDraft}
            onChange={e => setMemoDraft(e.target.value)}
            rows={2}
            placeholder={isEdit ? '메모 추가… (저장 후에도 계속 추가 가능)' : '메모 (선택)'}
            className={portalInput + ' w-full resize-y text-xs py-1.5'}
          />
          <div className="space-y-1.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-[#4b6cb7]">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={e => {
                  void onPickMemoImages(e.target.files);
                  e.currentTarget.value = '';
                }}
                className="hidden"
              />
              <span className="rounded-md bg-[#4b6cb7]/10 px-2 py-1">이미지 추가</span>
              <span className="font-normal text-slate-400">클릭하면 미리보기</span>
            </label>
            {memoAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {memoAttachments.map(att => (
                  <div key={att.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setImagePreview({ url: att.dataUrl, name: att.name })}
                      className="block"
                      title="미리보기"
                    >
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemoAttachments(prev => prev.filter(x => x.id !== att.id))}
                      className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {isEdit && (
            <p className="text-[10px] leading-snug text-slate-400">
              여러 명이 메모를 남길 수 있습니다. 본인이 작성한 메모는 수정·삭제할 수 있고, 메모에 이미지도 첨부할 수 있습니다.
            </p>
          )}
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
      </>
      ) : null}

      {imagePreview && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setImagePreview(null)}
          role="presentation"
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={imagePreview.name}
          >
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-white px-2 py-0.5 text-sm font-bold text-slate-700 shadow"
            >
              ×
            </button>
            <img
              src={imagePreview.url}
              alt={imagePreview.name}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-xl"
            />
            <p className="mt-2 truncate text-center text-xs text-white/90">{imagePreview.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
