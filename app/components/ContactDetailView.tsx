'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type {
  BusinessEntityType,
  ContactRecord,
  ContactUpdatePayload,
  ServiceType,
} from '../types/contact';
import {
  BUSINESS_ENTITY_LABEL,
  BUSINESS_ENTITY_TYPES,
  EDITABLE_FIELDS,
  SERVICE_TYPE_LABEL,
  SERVICE_TYPES,
} from '../types/contact';
import { TAX_TYPES } from '../config/taxTypes';
import type { TaxTypeId } from '../config/taxTypes';
import BackButton from './BackButton';
import { formatPhoneWithContactName } from '@/app/utils/clientPhone';
import { formatIdField } from '@/app/utils/idFormat';
import {
  portalAlertError,
  portalBtnDanger,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalInput,
} from '@/app/components/portal/uiClasses';
import { canChangeAssignedManager } from '@/lib/intakeManagerGate';

const TAX_LABEL: Record<string, string> = Object.fromEntries(
  TAX_TYPES.map(t => [t.id, t.label]),
);

interface ContactDetailViewProps {
  contact: ContactRecord;
  primaryContactName?: string;
  /** 담당자/관리자만 수정 가능. false면 조회 전용 */
  canEdit?: boolean;
  /** 상세 페이지 통합 레이아웃용 — 카드·중복 여백 제거 */
  variant?: 'card' | 'flat';
  /** flat 모드에서 상호 옆에 배치 (연락처 등) */
  titleAside?: React.ReactNode;
  /** 페이지 통합 수정 모드 */
  forcedEditing?: boolean;
  hideEditButton?: boolean;
  onSaveRef?: React.MutableRefObject<((opts?: { skipRefresh?: boolean }) => Promise<void>) | null>;
  /** 통합 저장용 — 현재 편집 폼 스냅샷 */
  getFormRef?: React.MutableRefObject<(() => ContactUpdatePayload) | null>;
}

function toFormState(contact: ContactRecord): ContactUpdatePayload {
  return {
    companyName: contact.companyName,
    manager: contact.manager,
    representative: contact.representative,
    businessNo: contact.businessNo,
    corporateNo: contact.corporateNo,
    residentNo: contact.residentNo,
    phone: contact.phone,
    mobilePhone: contact.mobilePhone,
    fax: contact.fax,
    taxTypes: [...contact.taxTypes],
    businessEntityType: contact.businessEntityType,
    serviceTypes: [...contact.serviceTypes],
  };
}

function displayValue(value: string): string {
  const s = value.trim();
  return s || '-';
}

function CategorySection({
  title,
  children,
  compact,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return <div className="mt-2">{children}</div>;
  }
  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
      {children}
    </div>
  );
}

export default function ContactDetailView({
  contact: initial,
  primaryContactName,
  canEdit = true,
  variant = 'card',
  titleAside,
  forcedEditing,
  hideEditButton = false,
  onSaveRef,
  getFormRef,
}: ContactDetailViewProps) {
  const router = useRouter();
  const [contact, setContact] = useState(initial);
  const [internalEditing, setInternalEditing] = useState(false);
  const [form, setForm] = useState<ContactUpdatePayload>(() => toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managerOptions, setManagerOptions] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    loginId?: string;
    role?: string;
    adminMode?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/login-users')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { users?: Array<{ name?: string }> } | null) => {
        if (cancelled || !data?.users) return;
        const names = [
          ...new Set(
            data.users.map(u => (u.name ?? '').trim()).filter(Boolean),
          ),
        ];
        setManagerOptions(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const u = (d as { user?: { name?: string; loginId?: string; role?: string; adminMode?: boolean } })?.user;
        if (u?.name) {
          setCurrentUser({
            name: u.name,
            loginId: u.loginId,
            role: u.role,
            adminMode: u.adminMode,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const canEditManager = canChangeAssignedManager(
    contact.manager,
    currentUser?.name ?? '',
    currentUser,
  );

  const startEdit = useCallback(() => {
    setForm(toFormState(contact));
    setError(null);
    setInternalEditing(true);
  }, [contact]);

  const cancelEdit = useCallback(() => {
    setForm(toFormState(contact));
    setError(null);
    setInternalEditing(false);
  }, [contact]);

  const updateField = useCallback((key: keyof ContactUpdatePayload, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleTaxType = useCallback((id: TaxTypeId) => {
    setForm(prev => ({
      ...prev,
      taxTypes: prev.taxTypes.includes(id)
        ? prev.taxTypes.filter(t => t !== id)
        : [...prev.taxTypes, id],
    }));
  }, []);

  const setBusinessEntityType = useCallback((id: BusinessEntityType) => {
    setForm(prev => ({
      ...prev,
      businessEntityType: prev.businessEntityType === id ? '' : id,
    }));
  }, []);

  const toggleServiceType = useCallback((id: ServiceType) => {
    setForm(prev => ({
      ...prev,
      serviceTypes: prev.serviceTypes.includes(id)
        ? prev.serviceTypes.filter(t => t !== id)
        : [...prev.serviceTypes, id],
    }));
  }, []);

  const handleSave = useCallback(async (opts?: { skipRefresh?: boolean }) => {
    if (!form.companyName.trim()) {
      setError('업체명은 필수입니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setContact((data.contact ?? data.client) as ContactRecord);
      setInternalEditing(false);
      // 통합 저장에서는 메타·자료 저장 전에 refresh하면 대분류 입력이 리셋됨
      if (!opts?.skipRefresh) {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [contact.id, form, router]);

  useEffect(() => {
    if (onSaveRef) onSaveRef.current = (opts?: { skipRefresh?: boolean }) => handleSave(opts);
  }, [handleSave, onSaveRef]);

  useEffect(() => {
    if (getFormRef) getFormRef.current = () => form;
  }, [form, getFormRef]);

  const isEditing = forcedEditing ?? internalEditing;

  const handleDelete = useCallback(async () => {
    if (
      !confirm(
        `"${contact.companyName}" 수임처를 삭제할까요?\n연결된 시트·이력 데이터는 연결만 해제됩니다. 이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${contact.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '삭제 실패');
      router.push('/clients');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    } finally {
      setDeleting(false);
    }
  }, [contact.companyName, contact.id, router]);

  const viewFields = EDITABLE_FIELDS.filter(
    f => f.key !== 'companyName',
  );

  const flat = variant === 'flat';

  return (
    <div className={flat ? '' : 'space-y-4'}>
      <div className={`flex items-center justify-between gap-3 ${flat ? 'px-4 pt-3' : ''}`}>
        <div className="flex min-w-0 items-center gap-2">
          <BackButton />
          {flat && (isEditing ? form.businessEntityType : contact.businessEntityType) && (
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                (isEditing ? form.businessEntityType : contact.businessEntityType) === 'corporate'
                  ? 'bg-indigo-100 text-indigo-800'
                  : (isEditing ? form.businessEntityType : contact.businessEntityType) === 'individual'
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              {BUSINESS_ENTITY_LABEL[(isEditing ? form.businessEntityType : contact.businessEntityType) as BusinessEntityType]}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
        {!canEdit || hideEditButton ? null : !isEditing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className={portalBtnDanger}
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
            <button
              type="button"
              onClick={startEdit}
              disabled={deleting}
              className={portalBtnPrimary}
            >
              수정
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className={portalBtnSecondary}
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={portalBtnPrimary}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}
        </div>
      </div>

      {error && <div className={`${portalAlertError} ${flat ? 'mx-4' : ''}`}>{error}</div>}

      <article className={flat ? '' : `${portalCard} overflow-hidden`}>
        <div className={`${flat ? 'border-b border-slate-200 px-4 py-3' : 'px-5 py-4 bg-slate-50 border-b border-slate-100'}`}>
          {!flat && <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">거래처</p>}
          <div className={`${flat ? 'flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5' : ''}`}>
            <div className={flat ? 'min-w-0 shrink-0 sm:max-w-[38%]' : ''}>
          {isEditing ? (
            <input
              type="text"
              value={form.companyName}
              onChange={e => updateField('companyName', e.target.value)}
              className={`${portalInput} w-full ${flat ? 'text-lg font-bold' : 'text-lg font-bold'}`}
              placeholder="업체명(상호)"
            />
          ) : (
            <h1 className={`font-bold text-slate-900 leading-snug ${flat ? 'text-lg' : 'text-2xl'}`}>{contact.companyName}</h1>
            )}

            {flat && !isEditing ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {contact.serviceTypes.map(t => (
                  <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    {SERVICE_TYPE_LABEL[t]}
                  </span>
                ))}
                {contact.taxTypes.map(t => (
                  <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    {TAX_LABEL[t] ?? t}
                  </span>
                ))}
              </div>
            ) : (
              <>
            <CategorySection title="기업구분" compact={flat}>
              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_ENTITY_TYPES.map(t => {
                    const checked = form.businessEntityType === t.id;
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="businessEntityType"
                          checked={checked}
                          onChange={() => setBusinessEntityType(t.id)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contact.businessEntityType ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                      {BUSINESS_ENTITY_LABEL[contact.businessEntityType]}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
              )}
            </CategorySection>

            <CategorySection title="서비스 유형" compact={flat}>
              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  {SERVICE_TYPES.map(t => {
                    const checked = form.serviceTypes.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleServiceType(t.id)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contact.serviceTypes.length > 0 ? (
                    contact.serviceTypes.map(t => (
                      <span key={t} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800">
                        {SERVICE_TYPE_LABEL[t]}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
              )}
            </CategorySection>

            <CategorySection title="세목" compact={flat}>
              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  {TAX_TYPES.map(t => {
                    const checked = form.taxTypes.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTaxType(t.id)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contact.taxTypes.length > 0 ? (
                    contact.taxTypes.map(t => (
                      <span key={t} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800">
                        {TAX_LABEL[t] ?? t}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </div>
              )}
            </CategorySection>
              </>
            )}
            </div>
            {flat && titleAside && (
              <div className="min-w-0 flex-1 sm:border-l sm:border-slate-100 sm:pl-5">
                {titleAside}
              </div>
            )}
          </div>
        </div>

        <div className={flat ? 'px-4 py-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3' : 'p-5 grid gap-3 sm:grid-cols-2'}>
          {viewFields.map(({ key, label, mono }) => {
            const selectOptions =
              key === 'manager'
                ? form.manager && !managerOptions.includes(form.manager)
                  ? [form.manager, ...managerOptions]
                  : managerOptions
                : null;
            return (
            <div key={key} className={flat ? 'min-w-0' : 'rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3'}>
              <p className={`font-medium text-slate-400 ${flat ? 'text-[10px]' : 'text-xs mb-1'}`}>{label}</p>
              {isEditing ? (
                selectOptions ? (
                  <select
                    value={form.manager}
                    onChange={e => updateField('manager', e.target.value)}
                    className={`${portalInput} w-full font-semibold ${flat ? '!py-1 !text-xs' : ''}`}
                    disabled={!canEditManager}
                    title={
                      canEditManager
                        ? undefined
                        : '담당자 지정 후에는 해당 담당자만 변경할 수 있습니다'
                    }
                  >
                    <option value="">선택…</option>
                    {selectOptions.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form[key] as string}
                    onChange={e => updateField(key, e.target.value)}
                    className={`${portalInput} w-full font-semibold ${mono ? 'font-mono' : ''} ${flat ? '!py-1 !text-xs' : ''}`}
                  />
                )
              ) : (
                <p className={`font-semibold text-slate-900 break-all ${mono ? 'font-mono' : ''} ${flat ? 'text-xs' : 'text-sm'}`}>
                  {key === 'phone'
                    ? displayValue(formatPhoneWithContactName(contact.phone, primaryContactName))
                    : key === 'businessNo' || key === 'corporateNo' || key === 'residentNo'
                      ? displayValue(formatIdField(key, contact[key] as string))
                      : displayValue(contact[key] as string)}
                </p>
              )}
            </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}
