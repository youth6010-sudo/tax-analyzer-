'use client';

import { useCallback, useEffect, useState } from 'react';
import { CONTACT_ROLES, type ClientContactRecord } from '@/app/types/clientContact';

type Props = {
  clientId: string;
  canEdit?: boolean;
  embedded?: boolean;
  /** 상호 옆 인라인 표시 */
  inline?: boolean;
};

const emptyForm = {
  name: '',
  role: '',
  phone: '',
  mobilePhone: '',
  contactKind: 'Phone',
  isPrimary: false,
};

function ContactAddForm({
  form,
  setForm,
  saving,
  onSave,
  onCancel,
}: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="이름"
          className="col-span-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          autoFocus
        />
        <select
          value={form.role}
          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
          className="col-span-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">역할 선택</option>
          {CONTACT_ROLES.map(r => (
            <option key={r} value={r}>
              {r.replace('_', ' ')}
            </option>
          ))}
        </select>
        <input
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          placeholder="전화번호"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={form.mobilePhone}
          onChange={e => setForm(f => ({ ...f, mobilePhone: e.target.value }))}
          placeholder="휴대번호"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={form.isPrimary}
          onChange={e => setForm(f => ({ ...f, isPrimary: e.target.checked }))}
        />
        주 연락처
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
        >
          취소
        </button>
        <button
          type="button"
          disabled={saving || !form.name.trim()}
          onClick={onSave}
          className="px-4 py-2 text-sm font-bold rounded-xl bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
        >
          {saving ? '저장 중…' : '추가'}
        </button>
      </div>
    </div>
  );
}

export default function ClientContactsPanel({ clientId, canEdit = true, embedded = false, inline = false }: Props) {
  const [contacts, setContacts] = useState<ClientContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`);
      const data = await res.json();
      if (res.ok) setContacts(data.contacts ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeAddForm = () => {
    setShowAddForm(false);
    setForm(emptyForm);
  };

  const saveNew = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('저장 실패');
      closeAddForm();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (id: string, patch: Partial<typeof emptyForm>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('저장 실패');
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 연락처를 삭제할까요?')) return;
    await fetch(`/api/clients/${clientId}/contacts/${id}`, { method: 'DELETE' });
    await load();
  };

  const isInline = inline;

  if (isInline) {
    return (
      <>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">연락처</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                + 추가
              </button>
            )}
          </div>
          {loading ? (
            <p className="text-xs text-slate-400">불러오는 중…</p>
          ) : contacts.length === 0 ? (
            <p className="text-xs text-slate-400">등록된 연락처가 없습니다.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {contacts.map(c => (
                <li key={c.id}>
                  <ContactRow
                    contact={c}
                    canEdit={canEdit}
                    editing={editingId === c.id}
                    saving={saving}
                    inline
                    onEdit={() => setEditingId(c.id)}
                    onCancel={() => setEditingId(null)}
                    onSave={patch => void saveEdit(c.id, patch)}
                    onDelete={() => void remove(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        {showAddForm && (
          <ContactAddModal
            form={form}
            setForm={setForm}
            saving={saving}
            onSave={() => void saveNew()}
            onClose={closeAddForm}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div
        className={
          embedded
            ? ''
            : 'rounded-2xl border border-gray-100 bg-white overflow-hidden'
        }
      >
        {!embedded && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-gray-900">연락처 목록</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">대표·사모·실무 담당 등 여러 명을 등록할 수 있습니다.</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="shrink-0 px-3 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              + 연락처 추가
            </button>
          )}
        </div>
        )}

        <div className={embedded ? 'space-y-2' : 'p-4 space-y-3'}>
          {embedded && canEdit && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="px-2 py-1 text-[10px] font-bold text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                + 연락처 추가
              </button>
            </div>
          )}
          {loading ? (
            <p className="text-xs text-gray-400">불러오는 중…</p>
          ) : contacts.length === 0 ? (
            <p className="text-xs text-gray-500">등록된 연락처가 없습니다.</p>
          ) : (
            contacts.map(c => (
              <ContactRow
                key={c.id}
                contact={c}
                canEdit={canEdit}
                editing={editingId === c.id}
                saving={saving}
                onEdit={() => setEditingId(c.id)}
                onCancel={() => setEditingId(null)}
                onSave={patch => void saveEdit(c.id, patch)}
                onDelete={() => void remove(c.id)}
              />
            ))
          )}
        </div>
      </div>

      {showAddForm && (
        <ContactAddModal
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={() => void saveNew()}
          onClose={closeAddForm}
        />
      )}
    </>
  );
}

function ContactAddModal({
  form,
  setForm,
  saving,
  onSave,
  onClose,
}: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-add-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 id="contact-add-title" className="text-base font-black text-gray-900">
            연락처 추가
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">이름·역할·전화번호를 입력하세요.</p>
        </div>
        <div className="p-5">
          <ContactAddForm
            form={form}
            setForm={setForm}
            saving={saving}
            onSave={onSave}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}

function ContactRow({
  contact,
  canEdit = true,
  editing,
  saving,
  inline = false,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  contact: ClientContactRecord;
  canEdit?: boolean;
  editing: boolean;
  saving: boolean;
  inline?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<typeof emptyForm>) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState({
    name: contact.name,
    role: contact.role,
    phone: contact.phone,
    mobilePhone: contact.mobilePhone,
    isPrimary: contact.isPrimary,
  });

  useEffect(() => {
    setLocal({
      name: contact.name,
      role: contact.role,
      phone: contact.phone,
      mobilePhone: contact.mobilePhone,
      isPrimary: contact.isPrimary,
    });
  }, [contact]);

  if (!editing && inline) {
    const roleLabel = contact.role?.replace('_', ' ');
    const phoneLine = [contact.mobilePhone, contact.phone].filter(Boolean).join(' · ') || '—';
    return (
      <div className="group min-w-0">
        <p className="truncate text-xs font-medium text-slate-800 leading-tight">
          {contact.name}
          {roleLabel && (
            <span className="ml-1 font-normal text-slate-500">({roleLabel})</span>
          )}
          {contact.isPrimary && (
            <span className="ml-0.5 text-[9px] font-bold text-blue-600">주</span>
          )}
        </p>
        {phoneLine !== '—' ? (
          <a
            href={`tel:${(contact.mobilePhone || contact.phone).replace(/\s/g, '')}`}
            className="block truncate text-[11px] text-blue-700 hover:underline leading-tight"
          >
            {phoneLine}
          </a>
        ) : (
          <p className="text-[11px] text-slate-400 leading-tight">—</p>
        )}
        {canEdit && (
          <div className="mt-0.5 hidden gap-2 group-hover:flex">
            <button type="button" onClick={onEdit} className="text-[10px] font-semibold text-slate-500 hover:text-blue-600">
              수정
            </button>
            <button type="button" onClick={onDelete} className="text-[10px] font-semibold text-red-500 hover:text-red-700">
              삭제
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
        <div>
          <p className="text-xs font-bold text-gray-900">
            {contact.name}
            {contact.role && (
              <span className="ml-1 text-[10px] font-semibold text-blue-700">
                ({contact.role.replace('_', ' ')})
              </span>
            )}
            {contact.isPrimary && (
              <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800">주</span>
            )}
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5">
            {contact.mobilePhone && <span>휴대 {contact.mobilePhone}</span>}
            {contact.mobilePhone && contact.phone && ' · '}
            {contact.phone && <span>전화 {contact.phone}</span>}
            {!contact.phone && !contact.mobilePhone && '—'}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <button type="button" onClick={onEdit} className="text-[10px] font-bold px-2 py-1 rounded border border-gray-200">
              수정
            </button>
            <button type="button" onClick={onDelete} className="text-[10px] font-bold px-2 py-1 rounded border border-red-200 text-red-700">
              삭제
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={local.name} onChange={e => setLocal(l => ({ ...l, name: e.target.value }))} className="border rounded px-2 py-1 text-xs" />
        <select value={local.role} onChange={e => setLocal(l => ({ ...l, role: e.target.value }))} className="border rounded px-2 py-1 text-xs">
          <option value="">역할</option>
          {CONTACT_ROLES.map(r => (
            <option key={r} value={r}>
              {r.replace('_', ' ')}
            </option>
          ))}
        </select>
        <input value={local.phone} onChange={e => setLocal(l => ({ ...l, phone: e.target.value }))} placeholder="전화" className="border rounded px-2 py-1 text-xs" />
        <input value={local.mobilePhone} onChange={e => setLocal(l => ({ ...l, mobilePhone: e.target.value }))} placeholder="휴대" className="border rounded px-2 py-1 text-xs" />
      </div>
      <label className="flex items-center gap-2 text-[10px]">
        <input type="checkbox" checked={local.isPrimary} onChange={e => setLocal(l => ({ ...l, isPrimary: e.target.checked }))} />
        주 연락처
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => onSave(local)} className="text-[10px] font-bold px-2 py-1 rounded bg-blue-600 text-white">
          저장
        </button>
        <button type="button" onClick={onCancel} className="text-[10px] font-bold px-2 py-1 rounded border">
          취소
        </button>
      </div>
    </div>
  );
}
