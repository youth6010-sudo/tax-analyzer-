'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ProcessChecklistPanel from './ProcessChecklistPanel';
import BlueholeRegisterCopyButton from './BlueholeRegisterCopyButton';
import IntakeClientLink from './IntakeClientLink';
import {
  INTAKE_CONTRACT_STATUS_OPTIONS,
  inquiryAssigneeManager,
  inquiryBlueholeCase,
  inquiryChecklistKeys,
  inquiryConsultTypes,
  inquiryNeedsOnboardingChecklist,
  inquiryNote,
  processRowFromApi,
  type InquiryRow,
  type ProcessRow,
} from './intakeUtils';
import BlueholeCaseLink from './BlueholeCaseLink';
import { canChangeAssignedManager } from '@/lib/intakeManagerGate';
import { fmt } from '@/app/lib/taxAmountFmt';

const inputCls =
  'mt-1 w-full min-w-0 border border-indigo-200 rounded-md px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none';

function defaultCompanyName(inquiry: InquiryRow): string {
  const name = inquiry.companyName.trim();
  return name && name !== '(미입력)' ? name : '';
}

function formFrom(inquiry: InquiryRow, process: ProcessRow | null) {
  const fee =
    process?.monthlyFee != null
      ? process.monthlyFee
      : inquiry.proposedFee != null
        ? inquiry.proposedFee
        : null;
  return {
    feeStartDate: process?.feeStartDate ?? inquiry.inquiryDate ?? '',
    monthlyFee: fee != null ? fmt(String(fee)) : '',
    contractStatus: inquiry.contractStatus || '',
    consultant: inquiry.consultant || '',
    assigneeManager: inquiryAssigneeManager(inquiry.extra),
    blueholeCase: inquiryBlueholeCase(inquiry.extra),
    note: inquiryNote(inquiry.extra),
  };
}

function canRegister(inquiry: InquiryRow, process: ProcessRow | null): boolean {
  const name = (process?.companyName || inquiry.companyName).trim();
  return Boolean(name && name !== '(미입력)');
}

function consultationSummary(inquiry: InquiryRow) {
  const companyName = defaultCompanyName(inquiry) || inquiry.companyName || '(미입력)';
  const channel = inquiry.channel.trim() || '-';
  const types = inquiryConsultTypes(inquiry.extra);
  return {
    companyName,
    channel,
    consultTypes: types.length ? types.join(', ') : '-',
  };
}

async function createMinimalProcess(inquiry: InquiryRow): Promise<ProcessRow> {
  const res = await fetch('/api/intake/processes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: inquiry.companyName.trim() || '(미입력)',
      clientId: inquiry.clientId,
      channel: inquiry.channel,
      monthlyFee: inquiry.proposedFee,
      feeStartDate: inquiry.inquiryDate,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '프로세스 생성 실패');
  return processRowFromApi(data.process as Record<string, unknown>);
}

function inquiryRowFromApi(inquiry: Record<string, unknown>): InquiryRow {
  return {
    id: String(inquiry.id),
    clientId: inquiry.clientId != null ? String(inquiry.clientId) : null,
    companyName: String(inquiry.companyName ?? ''),
    phone: String(inquiry.phone ?? ''),
    channel: String(inquiry.channel ?? ''),
    consultant: String(inquiry.consultant ?? ''),
    inquiryDate: String(inquiry.inquiryDate ?? ''),
    inquiryContent: String(inquiry.inquiryContent ?? ''),
    contractStatus: String(inquiry.contractStatus ?? ''),
    proposedFee: typeof inquiry.proposedFee === 'number' ? inquiry.proposedFee : null,
    industry: String(inquiry.industry ?? ''),
    businessNo: String(inquiry.businessNo ?? ''),
    representative: String(inquiry.representative ?? ''),
    address: String(inquiry.address ?? ''),
    extra: (inquiry.extra && typeof inquiry.extra === 'object'
      ? inquiry.extra
      : {}) as Record<string, unknown>,
    createdAt: inquiry.createdAt != null ? String(inquiry.createdAt) : '',
  };
}

export default function IntakeProcessPanel({
  inquiry,
  process,
  onProcessUpdated,
  onProcessCreated,
  onInquiryUpdated,
  onRegisterClient,
  onLinkClient,
  onToggleCheck,
  onSyncBlueholeCheck,
  onHideChecklistItem,
  onRestoreChecklist,
  allowRegister = true,
}: {
  inquiry: InquiryRow;
  process: ProcessRow | null;
  onProcessUpdated: (row: ProcessRow) => void;
  onProcessCreated: (row: ProcessRow) => void;
  onInquiryUpdated?: (row: InquiryRow) => void;
  onRegisterClient: (inquiryId: string, processId: string | null) => Promise<string | null>;
  onLinkClient?: (inquiryId: string, processId: string | null, clientId: string) => Promise<void>;
  onToggleCheck: (process: ProcessRow, key: string) => void | Promise<void>;
  onSyncBlueholeCheck?: (process: ProcessRow) => void | Promise<void>;
  onHideChecklistItem?: (process: ProcessRow, key: string) => void | Promise<void>;
  onRestoreChecklist?: (process: ProcessRow) => void | Promise<void>;
  allowRegister?: boolean;
}) {
  const [form, setForm] = useState(() => formFrom(inquiry, process));
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    loginId?: string;
    role?: string;
    adminMode?: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const [registeredClientId, setRegisteredClientId] = useState<string | null>(inquiry.clientId);

  const inquiryBluehole = inquiryBlueholeCase(inquiry.extra);
  const checklistEnabled = inquiryNeedsOnboardingChecklist(inquiry.extra);
  const checklistKeys = inquiryChecklistKeys(inquiry.extra);
  const summary = consultationSummary(inquiry);
  const canEditAssignee = canChangeAssignedManager(
    inquiryAssigneeManager(inquiry.extra),
    currentUser?.name ?? '',
    currentUser,
  );

  const processId = process?.id ?? null;

  useEffect(() => {
    setForm(formFrom(inquiry, process));
    setRegisteredClientId(inquiry.clientId ?? process?.clientId ?? null);
    setError('');
    // 체크리스트만 바뀌는 process 객체 갱신에는 폼을 리셋하지 않음 (담당자 입력 유지)
  }, [inquiry, processId]); // eslint-disable-line react-hooks/exhaustive-deps -- process는 id 변경 시에만

  useEffect(() => {
    if (process?.clientId) setRegisteredClientId(process.clientId);
  }, [process?.clientId]);

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

  // 수임처 연결돼 있고 유입 담당자 비어 있으면 수임처 담당자로 자동 채움
  useEffect(() => {
    const clientId = inquiry.clientId;
    if (!clientId) return;
    if (inquiryAssigneeManager(inquiry.extra)) return;
    let cancelled = false;
    void fetch(`/api/clients/${clientId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        const mgr = String(
          (d as { client?: { manager?: string }; contact?: { manager?: string } })?.client?.manager
            ?? (d as { contact?: { manager?: string } })?.contact?.manager
            ?? '',
        ).trim();
        if (!mgr) return;
        setForm(prev => (prev.assigneeManager.trim() ? prev : { ...prev, assigneeManager: mgr }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inquiry.id, inquiry.clientId, inquiry.extra]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/login-users')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { users?: Array<{ name?: string }> } | null) => {
        if (cancelled || !data?.users) return;
        const names = data.users
          .map(u => (u.name ?? '').trim())
          .filter(Boolean);
        setTeamNames([...new Set(names)]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const syncToClient = async (processId: string | null): Promise<string | null> => {
    if (!inquiry.id) return null;
    const syncRes = await fetch('/api/intake/register-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiryId: inquiry.id, processId }),
    });
    if (!syncRes.ok) {
      const syncData = await syncRes.json();
      throw new Error(syncData.error ?? '수임처 반영 실패');
    }
    const syncData = await syncRes.json();
    const id = syncData.client?.id != null ? String(syncData.client.id) : null;
    if (id) setRegisteredClientId(id);
    return id;
  };

  const patchInquiryMeta = async (monthlyFee: number | null) => {
    if (!inquiry.id) return null;
    const res = await fetch(`/api/intake/inquiries/${inquiry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: summary.companyName,
        channel: inquiry.channel,
        consultant: form.consultant.trim(),
        proposedFee: monthlyFee,
        contractStatus: form.contractStatus.trim(),
        extra: {
          assigneeManager: form.assigneeManager.trim(),
          blueholeCase: form.blueholeCase.trim(),
          note: form.note.trim(),
        },
      }),
    });
    if (!res.ok) throw new Error('유입 정보 저장 실패');
    const data = await res.json();
    const updated = inquiryRowFromApi(data.inquiry as Record<string, unknown>);
    onInquiryUpdated?.(updated);
    return updated;
  };

  const saveMeta = async (options?: { syncClient?: boolean }): Promise<ProcessRow | null> => {
    setSaving(true);
    setError('');
    const feeRaw = form.monthlyFee.trim().replace(/,/g, '');
    const monthlyFee = feeRaw ? Number(feeRaw) : null;
    const payload = {
      companyName: summary.companyName,
      feeStartDate: form.feeStartDate.trim(),
      monthlyFee: monthlyFee != null && !Number.isNaN(monthlyFee) ? monthlyFee : null,
      channel: inquiry.channel.trim(),
    };

    let savedProcess: ProcessRow | null = process;

    try {
      if (form.contractStatus.trim() === '계약완료' && !(registeredClientId ?? inquiry.clientId)) {
        throw new Error('계약완료는 수임처 등록이 필수입니다. 먼저 수임처를 등록해 주세요.');
      }

      if (process) {
        const res = await fetch(`/api/processes/${process.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('저장 실패');
        const data = await res.json();
        savedProcess = processRowFromApi(data.process as Record<string, unknown>);
        onProcessUpdated(savedProcess);
      } else if (checklistEnabled) {
        const res = await fetch('/api/intake/processes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, clientId: inquiry.clientId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '등록 실패');
        savedProcess = processRowFromApi(data.process as Record<string, unknown>);
        onProcessCreated(savedProcess);
      }

      await patchInquiryMeta(payload.monthlyFee);

      const shouldSync =
        options?.syncClient !== false && Boolean(registeredClientId ?? inquiry.clientId);
      if (shouldSync) {
        await syncToClient(savedProcess?.id ?? null);
      }

      return savedProcess;
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const ensureProcess = async (): Promise<ProcessRow> => {
    if (process) return process;
    const proc = await createMinimalProcess(inquiry);
    onProcessCreated(proc);
    return proc;
  };

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    try {
      if (checklistEnabled) {
        const proc = await saveMeta();
        if (!proc) return;
        const clientId = await onRegisterClient(inquiry.id, proc.id);
        if (clientId) setRegisteredClientId(clientId);
        return;
      }

      const feeRaw = form.monthlyFee.trim().replace(/,/g, '');
      const monthlyFee = feeRaw ? Number(feeRaw) : null;
      await patchInquiryMeta(monthlyFee != null && !Number.isNaN(monthlyFee) ? monthlyFee : null);
      const clientId = await onRegisterClient(inquiry.id, process?.id ?? null);
      if (clientId) setRegisteredClientId(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '수임처 등록 실패');
    } finally {
      setRegistering(false);
    }
  };

  const handleLink = async (clientId: string) => {
    if (!onLinkClient) return;
    setLinking(true);
    setError('');
    try {
      if (checklistEnabled) {
        const proc = (await saveMeta({ syncClient: false })) ?? process ?? (await ensureProcess());
        await onLinkClient(inquiry.id, proc.id, clientId);
        setRegisteredClientId(clientId);
        if (inquiry.id) await syncToClient(proc.id);
        return;
      }
      await onLinkClient(inquiry.id, process?.id ?? null, clientId);
      setRegisteredClientId(clientId);
      if (inquiry.id) await syncToClient(process?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '수임처 연결 실패');
    } finally {
      setLinking(false);
    }
  };

  const syncedBlueholeRef = useRef<string | null>(null);

  useEffect(() => {
    syncedBlueholeRef.current = null;
  }, [inquiry.id]);

  useEffect(() => {
    if (!checklistEnabled) return;
    if (!process || !inquiryBluehole.trim() || process.checklist?.blueholeClient) return;
    const token = `${process.id}:${inquiryBluehole}`;
    if (syncedBlueholeRef.current === token) return;
    syncedBlueholeRef.current = token;
    void onSyncBlueholeCheck?.(process);
  }, [
    checklistEnabled,
    process?.id,
    process?.checklist?.blueholeClient,
    inquiryBluehole,
    onSyncBlueholeCheck,
  ]);

  const assigneeOptions = [...teamNames];
  if (form.assigneeManager && !assigneeOptions.includes(form.assigneeManager)) {
    assigneeOptions.unshift(form.assigneeManager);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-100 bg-white/80 px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">상담지 기준</p>
        <dl className="grid gap-1.5 sm:grid-cols-3 text-xs">
          <div className="min-w-0">
            <dt className="font-semibold text-indigo-900">업체명</dt>
            <dd className="mt-0.5 truncate font-bold text-slate-900" title={summary.companyName}>
              {summary.companyName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-semibold text-indigo-900">유입경로</dt>
            <dd className="mt-0.5 truncate text-slate-800" title={summary.channel}>
              {summary.channel}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-semibold text-indigo-900">문의유형</dt>
            <dd className="mt-0.5 truncate text-slate-800" title={summary.consultTypes}>
              {summary.consultTypes}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">초회상담자</span>
          <select
            value={form.consultant}
            onChange={e => setForm(prev => ({ ...prev, consultant: e.target.value }))}
            className={inputCls}
          >
            <option value="">선택…</option>
            {assigneeOptions.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {form.consultant && !assigneeOptions.includes(form.consultant) && (
              <option value={form.consultant}>{form.consultant}</option>
            )}
          </select>
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">담당자</span>
          <select
            value={form.assigneeManager}
            onChange={e => setForm(prev => ({ ...prev, assigneeManager: e.target.value }))}
            className={inputCls}
            disabled={!canEditAssignee}
            title={
              canEditAssignee
                ? undefined
                : '담당자 지정 후에는 해당 담당자만 변경할 수 있습니다'
            }
          >
            <option value="">선택…</option>
            {assigneeOptions.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {!canEditAssignee && (
            <p className="mt-0.5 text-[10px] text-slate-400">지정된 담당자만 변경 가능</p>
          )}
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">계약유무</span>
          <select
            value={form.contractStatus}
            onChange={e => setForm(prev => ({ ...prev, contractStatus: e.target.value }))}
            className={inputCls}
          >
            <option value="">선택…</option>
            {INTAKE_CONTRACT_STATUS_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {form.contractStatus &&
              !(INTAKE_CONTRACT_STATUS_OPTIONS as readonly string[]).includes(form.contractStatus) && (
                <option value={form.contractStatus}>{form.contractStatus}</option>
              )}
          </select>
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">수수료 발생일</span>
          <input
            type="date"
            value={form.feeStartDate}
            onChange={e => setForm(prev => ({ ...prev, feeStartDate: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">제안금액</span>
          <input
            value={form.monthlyFee}
            onChange={e => setForm(prev => ({ ...prev, monthlyFee: fmt(e.target.value) }))}
            className={inputCls}
            placeholder="숫자"
            inputMode="numeric"
            aria-label="제안금액"
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-indigo-900">블루홀케이스</span>
          <input
            value={form.blueholeCase}
            onChange={e => setForm(prev => ({ ...prev, blueholeCase: e.target.value }))}
            className={inputCls}
            placeholder="케이스 번호"
          />
          {form.blueholeCase.trim() ? (
            <div className="mt-1 min-w-0 truncate">
              <BlueholeCaseLink value={form.blueholeCase} className="text-[11px]" />
            </div>
          ) : null}
        </label>
        <label className="block text-xs col-span-2 sm:col-span-2">
          <span className="font-semibold text-indigo-900">특이사항</span>
          <textarea
            value={form.note}
            onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
            rows={2}
            className={inputCls}
          />
        </label>
        <div className="flex items-end col-span-2 sm:col-span-1">
          <button
            type="button"
            disabled={saving || registering}
            onClick={() => void saveMeta()}
            className="w-full text-xs px-3 py-2 rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '…' : registeredClientId ? '저장·수임처 반영' : '저장'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <BlueholeRegisterCopyButton inquiry={inquiry} process={process} />

      {checklistEnabled ? (
        <ProcessChecklistPanel
          process={process}
          inquiryBluehole={inquiryBluehole}
          allowedKeys={checklistKeys}
          onToggleCheck={onToggleCheck}
          onSyncBlueholeCheck={onSyncBlueholeCheck}
          onEnsureProcess={ensureProcess}
          onHideItem={onHideChecklistItem}
          onRestoreHidden={onRestoreChecklist}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          양도·증여 등 기장·신고가 아닌 건은 온보딩 체크리스트·업체알림 대상이 아닙니다. 수임처 등록은 가능합니다.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-200/60">
        {registeredClientId ? (
          <>
            <Link
              href={`/clients/${registeredClientId}`}
              className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700"
            >
              수임처 →
            </Link>
            {onLinkClient && inquiry.id && (
              <div className="min-w-[10rem] flex-1">
                <IntakeClientLink
                  disabled={linking || registering || saving}
                  currentClientId={registeredClientId}
                  onLinked={c => void handleLink(c.id)}
                />
              </div>
            )}
          </>
        ) : (
          <>
            {allowRegister && inquiry.id && (
              <button
                type="button"
                disabled={registering || saving || !canRegister(inquiry, process)}
                onClick={() => void handleRegister()}
                className={`text-xs px-3 py-1.5 rounded-md font-bold disabled:opacity-50 ${
                  form.contractStatus.trim() === '계약완료'
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-slate-800 text-white hover:bg-slate-900'
                }`}
                title={
                  form.contractStatus.trim() === '계약완료'
                    ? '계약완료는 수임처 등록이 필수입니다'
                    : undefined
                }
              >
                {registering
                  ? '…'
                  : form.contractStatus.trim() === '계약완료'
                    ? '수임처 등록 (필수)'
                    : '수임처 등록'}
              </button>
            )}
            {form.contractStatus.trim() === '계약완료' && !registeredClientId && (
              <span className="text-[11px] font-semibold text-rose-600">
                계약완료 시 수임처 등록 필수
              </span>
            )}
            {onLinkClient && inquiry.id && (
              <IntakeClientLink
                disabled={linking || registering || saving}
                onLinked={c => void handleLink(c.id)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
