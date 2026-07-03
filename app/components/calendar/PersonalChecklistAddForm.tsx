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
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import ScopedClientSearch from '@/app/components/calendar/ScopedClientSearch';
import { useIsMasterUser } from '@/app/utils/useIsMasterUser';

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

  const [taxType, setTaxType] = useState<ChecklistTaxType>('other');
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [dueDate, setDueDate] = useState('');
  const [reflectInNotes, setReflectInNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

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
      setReflectInNotes(editItem.reflectInNotes);
      return;
    }
    setTaxType('other');
    setTitle('');
    setClientId(defaultClientId || '');
    setDueDate('');
    setReflectInNotes(false);
  }, [editItem, defaultClientId]);

  const clients = useMemo(() => {
    if (taxType === 'other') {
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

  const handleTaxTypeChange = (next: ChecklistTaxType) => {
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
    if (!title.trim()) {
      window.alert('체크리스트 내용을 입력해주세요.');
      return;
    }
    if (!dueDate.trim()) {
      window.alert('마감일을 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      title,
      taxType,
      clientId: clientId || null,
      dueDate,
      reflectInNotes,
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
        setTitle('');
        setDueDate('');
        setReflectInNotes(false);
        onCreated?.();
      } else {
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
      <FormRow label="구분">
        <select
          value={taxType}
          onChange={e => handleTaxTypeChange(e.target.value as ChecklistTaxType)}
          className={portalInput + ' w-full text-xs py-1.5'}
          aria-label="구분"
        >
          {CHECKLIST_TAX_OPTIONS.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </FormRow>

      <FormRow label="체크리스트 내용" required>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={portalInput + ' w-full text-xs py-1.5'}
          aria-required
        />
      </FormRow>

      <FormRow label="수임처">
        <ScopedClientSearch
          candidates={clients}
          clientId={clientId}
          onSelect={setClientId}
          loading={clientsLoading}
          placeholder="검색"
          emptyHint={taxType === 'other' ? '검색 결과 없음' : '해당 세목 범위에서 검색 결과 없음'}
        />
      </FormRow>

      <FormRow label="마감일" required>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className={portalInput + ' w-full text-xs py-1.5'}
          aria-required
        />
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

      <p className="pl-[6.5rem] text-[10px] text-slate-400">
        <span className="text-red-500">*</span> 필수 입력
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {isEdit && editItem?.createdAt && (
        <p className="text-xs text-slate-500 pl-[6.5rem]">
          등록: {formatCalendarCreatedAt(editItem.createdAt)}
        </p>
      )}

      <div className="flex gap-2">
        {isEdit && (
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
          className={portalBtnPrimary + ' flex-1 text-xs py-1.5'}
        >
          {saving ? '저장 중…' : isEdit ? '저장' : '추가'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={portalBtnSecondary + ' text-xs py-1.5'}>
            취소
          </button>
        )}
      </div>
    </div>
  );
}
