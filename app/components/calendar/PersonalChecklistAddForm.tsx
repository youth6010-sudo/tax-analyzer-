'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPortalClients, hydratePortal } from '@/app/utils/portalStore';
import type { ClientRecord } from '@/app/types/client';
import {
  CHECKLIST_TAX_OPTIONS,
  type ChecklistCategory,
  type ChecklistTaxType,
} from '@/app/types/calendar';
import { filingTargets, type FilingTaxId } from '@/app/utils/filingCheck';
import { useDashboardTaxFilter } from '@/app/utils/dashboardTaxFilter';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import ScopedClientSearch from '@/app/components/calendar/ScopedClientSearch';

type Props = {
  onCreated?: () => void;
  onCancel?: () => void;
  defaultClientId?: string;
  inModal?: boolean;
};

function checklistTaxToFilingTax(taxType: ChecklistTaxType): FilingTaxId {
  return taxType;
}

function clientsForTaxType(clients: ClientRecord[], taxType: ChecklistTaxType): ClientRecord[] {
  return filingTargets(clients, checklistTaxToFilingTax(taxType))
    .filter(c => c.status !== 'churned')
    .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '', 'ko'));
}

function filingTaxToChecklistTax(id: FilingTaxId | null): ChecklistTaxType | null {
  if (id === 'withholding' || id === 'vat' || id === 'comprehensive' || id === 'corporate') {
    return id;
  }
  return null;
}

export default function PersonalChecklistAddForm({ onCreated, onCancel, defaultClientId, inModal }: Props) {
  const dashboardTax = useDashboardTaxFilter();
  const initialTax = filingTaxToChecklistTax(dashboardTax) ?? 'withholding';

  const [category, setCategory] = useState<ChecklistCategory>('tax');
  const [taxType, setTaxType] = useState<ChecklistTaxType>(initialTax);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [dueDate, setDueDate] = useState('');
  const [reflectInNotes, setReflectInNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    hydratePortal();
    setClientsLoading(true);
    fetch('/api/clients?mine=1', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setAllClients((d?.clients as ClientRecord[]) ?? getPortalClients()))
      .catch(() => setAllClients(getPortalClients()))
      .finally(() => setClientsLoading(false));
  }, []);

  useEffect(() => {
    const mapped = filingTaxToChecklistTax(dashboardTax);
    if (mapped) setTaxType(mapped);
  }, [dashboardTax]);

  const clients = useMemo(() => {
    if (category !== 'tax') {
      return allClients
        .filter(c => c.status !== 'churned')
        .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '', 'ko'));
    }
    return clientsForTaxType(allClients, taxType);
  }, [allClients, category, taxType]);

  useEffect(() => {
    if (!clientId) return;
    if (!clients.some(c => c.id === clientId)) setClientId('');
  }, [clients, clientId]);

  const handleTaxTypeChange = (next: ChecklistTaxType) => {
    setTaxType(next);
    setClientId('');
  };

  const handleCategoryChange = (next: ChecklistCategory) => {
    setCategory(next);
    setClientId('');
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/calendar/personal-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          taxType: category === 'tax' ? taxType : '',
          clientId: clientId || null,
          dueDate,
          reflectInNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
      setTitle('');
      setDueDate('');
      setReflectInNotes(false);
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const wrapperCls = inModal ? 'space-y-3' : 'rounded-lg border border-amber-200 bg-white p-3 space-y-2';

  return (
    <div className={wrapperCls}>
      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
        <button
          type="button"
          onClick={() => handleCategoryChange('tax')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            category === 'tax' ? 'bg-amber-100 text-amber-900' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          세목
        </button>
        <button
          type="button"
          onClick={() => handleCategoryChange('other')}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            category === 'other' ? 'bg-amber-100 text-amber-900' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          기타
        </button>
      </div>

      {category === 'tax' && (
        <select
          value={taxType}
          onChange={e => handleTaxTypeChange(e.target.value as ChecklistTaxType)}
          className={portalInput + ' w-full text-xs py-1.5'}
        >
          {CHECKLIST_TAX_OPTIONS.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )}

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="체크리스트 내용"
        className={portalInput + ' w-full text-xs py-1.5'}
      />

      <ScopedClientSearch
        candidates={clients}
        clientId={clientId}
        onSelect={setClientId}
        loading={clientsLoading}
        placeholder={
          category === 'tax'
            ? `${CHECKLIST_TAX_OPTIONS.find(o => o.id === taxType)?.label ?? '세목'} 수임처 검색`
            : '수임처 검색'
        }
        emptyHint={
          category === 'tax' ? '해당 세목 범위에서 검색 결과 없음' : '검색 결과 없음'
        }
      />

      <input
        type="date"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        className={portalInput + ' w-full text-xs py-1.5'}
      />

      <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={reflectInNotes}
          onChange={e => setReflectInNotes(e.target.checked)}
          className="mt-0.5"
        />
        <span>업체별 특이사항에 반영</span>
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !title.trim()}
          className={portalBtnPrimary + ' flex-1 text-xs py-1.5'}
        >
          {saving ? '저장 중…' : '추가'}
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
