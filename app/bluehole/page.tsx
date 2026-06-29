'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalPageShell, { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalAlertInfo,
  portalBtnDanger,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalInput,
  portalSelect,
  portalToolTab,
  portalToolTabGroup,
} from '@/app/components/portal/uiClasses';

const BLUEHOLE_HOST = 'https://bluehole.world';

type Tab = 'clients' | 'cases' | 'account';

type AccountState = { loginId: string; configured: boolean; fallbackAvailable: boolean };
type Branch = { id: string; name: string };
type TeamMember = { id: string; name: string; nickname: string };
type MyProfile = { id: string; name: string; branch_id: string; branch_name: string; team_id: string; team_name: string };

type ClientRow = {
  id: string;
  name: string;
  aka: string;
  business_number: string;
  branch_name: string;
  manager_name: string;
  tax_type: string;
  service_status: string;
};

type ClientField = { col: string; label: string; type: string; enumKey?: string; group: string };
type EnumOption = { value: string; text: string };
type ClientDetail = {
  id: string;
  name: string;
  business_number: string;
  manager: string;
  branch: string;
  updated_at: string;
  values: Record<string, string>;
  labels: Record<string, string>;
  CLIENT_FIELDS: ClientField[];
  enumOptions: Record<string, EnumOption[]>;
};

type CaseRow = {
  id: string;
  subject: string;
  client_id: string;
  client_name: string;
  status: string;
  status_code: string;
  priority: string;
  due_date: string;
  assigned_name: string;
  url: string;
};
type CaseDetail = Record<string, string>;

export default function BlueholePage() {
  return (
    <Suspense fallback={null}>
      <BlueholeHub />
    </Suspense>
  );
}

function BlueholeHub() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'clients';
  const [tab, setTab] = useState<Tab>(['clients', 'cases', 'account'].includes(initialTab) ? initialTab : 'clients');

  const [account, setAccount] = useState<AccountState | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [me, setMe] = useState<MyProfile | null>(null);
  const [branchId, setBranchId] = useState<string>('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/bluehole/account', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setAccount(data);
    } catch {
      /* 무시 */
    }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/bluehole/branches', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setBranches(data.branches || []);
        setTeam(data.team || []);
        setMe(data.me || null);
        if (data.me?.branch_id) setBranchId((prev) => prev || data.me.branch_id);
      }
    } catch {
      /* 무시 */
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (account?.configured || account?.fallbackAvailable) void loadBranches();
  }, [account, loadBranches]);

  const notify = useCallback((msg: string, isError = false) => {
    setInfo(isError ? '' : msg);
    setError(isError ? msg : '');
  }, []);

  const accountReady = account?.configured || account?.fallbackAvailable;

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="블루홀"
        description="부산팀 거래처·케이스를 조회하고 수정·생성합니다. (기본: 내 지점)"
        icon="🔗"
        actions={
          <a href={BLUEHOLE_HOST} target="_blank" rel="noreferrer" className={portalBtnSecondary}>
            블루홀 열기 ↗
          </a>
        }
      />

      <AccountBar account={account} onChanged={loadAccount} notify={notify} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className={portalToolTabGroup}>
          {([
            { id: 'clients', label: '🏢 거래처' },
            { id: 'cases', label: '📋 케이스' },
            { id: 'account', label: '👤 계정' },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setInfo('');
                setError('');
              }}
              className={portalToolTab(tab === t.id, 'blue')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'account' && branches.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            지점
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${portalSelect} py-1.5`}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {me?.branch_id === b.id ? ' (내 지점)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {info && <div className={`${portalAlertInfo} mb-4`}>{info}</div>}
      {error && <div className={`${portalAlertError} mb-4`}>{error}</div>}

      {!accountReady && tab !== 'account' ? (
        <div className={portalEmptyState}>
          블루홀 계정이 없습니다. <button type="button" onClick={() => setTab('account')} className="font-semibold underline">계정 탭</button>에서 먼저 연결하세요.
        </div>
      ) : tab === 'clients' ? (
        <ClientsTab branchId={branchId} notify={notify} />
      ) : tab === 'cases' ? (
        <CasesTab team={team} myId={me?.id || ''} notify={notify} />
      ) : (
        <AccountTab account={account} onChanged={loadAccount} notify={notify} />
      )}
    </PortalPageShell>
  );
}

/* ───────────────────────── 계정 ───────────────────────── */

function AccountBar({
  account,
  onChanged,
  notify,
}: {
  account: AccountState | null;
  onChanged: () => void;
  notify: (m: string, e?: boolean) => void;
}) {
  void onChanged;
  void notify;
  return (
    <div className={`${portalCard} mb-4 px-4 py-2.5 flex items-center gap-2 text-sm`}>
      <span className="font-semibold text-slate-700">내 블루홀 계정</span>
      {account?.configured ? (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">연결됨 · {account.loginId}</span>
      ) : account?.fallbackAvailable ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">공용(폴백) 계정 사용 중</span>
      ) : (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">미등록</span>
      )}
    </div>
  );
}

function AccountTab({
  account,
  onChanged,
  notify,
}: {
  account: AccountState | null;
  onChanged: () => void;
  notify: (m: string, e?: boolean) => void;
}) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoginId(account?.loginId || '');
  }, [account]);

  const save = useCallback(async () => {
    if (!loginId.trim() || !password) {
      notify('블루홀 아이디와 비밀번호를 입력하세요.', true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/bluehole/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: loginId.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '계정 저장 실패');
      notify(`블루홀 계정 연결 완료 · ${data.name}`);
      setPassword('');
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : '계정 저장 실패', true);
    } finally {
      setSaving(false);
    }
  }, [loginId, password, notify, onChanged]);

  const remove = useCallback(async () => {
    if (!confirm('등록된 블루홀 계정을 해제할까요?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bluehole/account', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '계정 해제 실패');
      notify('블루홀 계정을 해제했습니다.');
      setPassword('');
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : '계정 해제 실패', true);
    } finally {
      setSaving(false);
    }
  }, [notify, onChanged]);

  return (
    <div className={`${portalCard} max-w-xl p-5`}>
      <h2 className="mb-1 text-base font-semibold text-slate-900">내 블루홀 계정 연결</h2>
      <p className="mb-4 text-sm text-slate-500">
        비밀번호는 서버에서 암호화(AES-GCM)되어 저장되며, 저장 전 블루홀 로그인으로 검증합니다.
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder="블루홀 아이디(이메일)"
          autoComplete="off"
          className={portalInput}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="블루홀 비밀번호"
          autoComplete="new-password"
          className={portalInput}
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} className={portalBtnPrimary} disabled={saving}>
            {saving ? '확인 중…' : '저장 및 연결'}
          </button>
          {account?.configured && (
            <button type="button" onClick={remove} className={portalBtnDanger} disabled={saving}>
              연결 해제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 거래처 ───────────────────────── */

function ClientsTab({ branchId, notify }: { branchId: string; notify: (m: string, e?: boolean) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const usp = new URLSearchParams({ list: '1', limit: '2000' });
      if (branchId) usp.set('branchId', branchId);
      if (q.trim()) usp.set('q', q.trim());
      const res = await fetch(`/api/bluehole/clients?${usp}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '목록 조회 실패');
      setRows(data.clients || []);
    } catch (e) {
      notify(e instanceof Error ? e.message : '목록 조회 실패', true);
    } finally {
      setLoading(false);
    }
  }, [branchId, q, notify]);

  useEffect(() => {
    if (branchId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className={`${portalCard} flex flex-col overflow-hidden`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
          className="flex items-center gap-2 border-b border-slate-100 p-3"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="거래처명 검색"
            className={`${portalInput} flex-1`}
          />
          <button type="submit" className={portalBtnSecondary} disabled={loading}>
            {loading ? '…' : '검색'}
          </button>
        </form>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
          <span>{rows.length}건</span>
          <button type="button" onClick={() => setCreating(true)} className="font-semibold text-blue-600 hover:underline">
            + 신규 거래처
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${
                selectedId === c.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="font-medium text-slate-900">
                {c.name}
                {c.aka ? <span className="ml-1 text-xs text-slate-400">({c.aka})</span> : null}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {c.business_number || '사업자번호 없음'} · {c.manager_name || '담당 없음'}
              </div>
            </button>
          ))}
          {!loading && rows.length === 0 && <div className="px-3 py-10 text-center text-sm text-slate-500">거래처가 없습니다.</div>}
        </div>
      </div>

      <div>
        {selectedId ? (
          <ClientDetailView key={selectedId} id={selectedId} notify={notify} onSaved={load} />
        ) : (
          <div className={portalEmptyState}>왼쪽에서 거래처를 선택하세요.</div>
        )}
      </div>

      {creating && <ClientCreateModal onClose={() => setCreating(false)} notify={notify} onCreated={(id) => { setCreating(false); setSelectedId(id); void load(); }} />}
    </div>
  );
}

function ClientDetailView({ id, notify, onSaved }: { id: string; notify: (m: string, e?: boolean) => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bluehole/clients/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setDetail(data.client);
    } catch (e) {
      notify(e instanceof Error ? e.message : '조회 실패', true);
    } finally {
      setLoading(false);
    }
  }, [id, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (!detail) return;
    setDraft({ ...detail.values });
    setEditing(true);
  };

  const save = useCallback(async () => {
    if (!detail) return;
    const changes: Record<string, string> = {};
    for (const f of detail.CLIENT_FIELDS) {
      const next = draft[f.col] ?? '';
      if (next !== (detail.values[f.col] ?? '')) changes[f.col] = next;
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    if (!confirm(`블루홀 거래처에 ${Object.keys(changes).length}개 항목을 반영합니다. 진행할까요?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bluehole/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수정 실패');
      const warn = (data.warnings || []).length ? ` (경고: ${data.warnings.join(', ')})` : '';
      notify(`반영 완료: ${(data.successCols || []).length}개 항목${warn}`);
      setEditing(false);
      await load();
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : '수정 실패', true);
    } finally {
      setSaving(false);
    }
  }, [detail, draft, id, notify, load, onSaved]);

  if (loading) return <div className={portalEmptyState}>불러오는 중…</div>;
  if (!detail) return <div className={portalEmptyState}>거래처 정보를 불러오지 못했습니다.</div>;

  const groups = [...new Set(detail.CLIENT_FIELDS.map((f) => f.group))];

  return (
    <div className={`${portalCard} p-5`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{detail.name}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {detail.branch || '-'} · {detail.manager || '담당 없음'} · #{detail.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`${BLUEHOLE_HOST}/client/info/${detail.id}`} target="_blank" rel="noreferrer" className={portalBtnSecondary}>
            열기 ↗
          </a>
          {editing ? (
            <>
              <button type="button" onClick={() => setEditing(false)} className={portalBtnSecondary} disabled={saving}>
                취소
              </button>
              <button type="button" onClick={save} className={portalBtnPrimary} disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <button type="button" onClick={startEdit} className={portalBtnPrimary}>
              수정
            </button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{g}</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {detail.CLIENT_FIELDS.filter((f) => f.group === g).map((f) => (
                <div key={f.col} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-slate-500">{f.label}</dt>
                  <dd className="text-sm text-slate-900">
                    {editing ? (
                      f.type === 'enum' && f.enumKey ? (
                        <select
                          value={draft[f.col] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.value }))}
                          className={`${portalSelect} w-full py-1.5`}
                        >
                          <option value="">(미지정)</option>
                          {(detail.enumOptions[f.enumKey] || []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.text}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={f.type === 'date' ? 'date' : 'text'}
                          value={draft[f.col] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.col]: e.target.value }))}
                          className={`${portalInput} w-full py-1.5`}
                        />
                      )
                    ) : f.type === 'enum' ? (
                      detail.labels[f.col] || <span className="text-slate-400">-</span>
                    ) : (
                      detail.values[f.col] || <span className="text-slate-400">-</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientCreateModal({
  onClose,
  onCreated,
  notify,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  notify: (m: string, e?: boolean) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    name: '',
    business_number: '',
    corp_type: '',
    ceo_name: '',
    ceo_phone: '',
    acc_address: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = useCallback(
    async (force: boolean) => {
      if (!form.name.trim()) {
        notify('거래처명은 필수입니다.', true);
        return;
      }
      if (!force && !confirm('블루홀 거래처를 새로 생성합니다. 블루홀은 삭제 기능이 없어 영구 생성됩니다. 진행할까요?')) return;
      setSaving(true);
      try {
        const res = await fetch('/api/bluehole/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: form, force }),
        });
        const data = await res.json();
        if (res.status === 409 && data.duplicate) {
          const names = (data.candidates || []).map((c: { name: string }) => c.name).join(', ');
          if (confirm(`같은 사업자번호의 거래처가 있습니다: ${names}\n그래도 생성할까요? (영구)`)) {
            await submit(true);
          }
          setSaving(false);
          return;
        }
        if (!res.ok) throw new Error(data.error || '생성 실패');
        notify(`거래처 생성 완료 · #${data.newId}`);
        onCreated(data.newId);
      } catch (e) {
        notify(e instanceof Error ? e.message : '생성 실패', true);
      } finally {
        setSaving(false);
      }
    },
    [form, notify, onCreated],
  );

  const field = (col: string, label: string, type = 'text') => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      {col === 'corp_type' ? (
        <select value={form[col]} onChange={(e) => setForm((f) => ({ ...f, [col]: e.target.value }))} className={portalSelect}>
          <option value="">(미지정)</option>
          <option value="1">개인</option>
          <option value="2">법인</option>
          <option value="3">비사업자</option>
        </select>
      ) : (
        <input
          type={type}
          value={form[col]}
          onChange={(e) => setForm((f) => ({ ...f, [col]: e.target.value }))}
          className={portalInput}
        />
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className={`${portalCard} w-full max-w-lg p-5`} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold text-slate-900">신규 거래처 생성</h2>
        <p className="mb-4 text-xs text-red-600">블루홀은 삭제 기능이 없어 생성 시 영구 반영됩니다.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('name', '거래처명 *')}
          {field('business_number', '사업자번호')}
          {field('corp_type', '기업구분')}
          {field('ceo_name', '대표자')}
          {field('ceo_phone', '대표 연락처')}
          {field('acc_address', '주소')}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={portalBtnSecondary} disabled={saving}>
            취소
          </button>
          <button type="button" onClick={() => submit(false)} className={portalBtnPrimary} disabled={saving}>
            {saving ? '생성 중…' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 케이스 ───────────────────────── */

function CasesTab({ team, myId, notify }: { team: TeamMember[]; myId: string; notify: (m: string, e?: boolean) => void }) {
  const [q, setQ] = useState('');
  const [assignedBy, setAssignedBy] = useState('');
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const usp = new URLSearchParams({ limit: '500' });
      if (q.trim()) usp.set('q', q.trim());
      if (assignedBy) usp.set('assignedBy', assignedBy);
      const res = await fetch(`/api/bluehole/cases?${usp}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '케이스 조회 실패');
      setRows(data.rows || []);
    } catch (e) {
      notify(e instanceof Error ? e.message : '케이스 조회 실패', true);
    } finally {
      setLoading(false);
    }
  }, [q, assignedBy, notify]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedBy]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className={`${portalCard} flex flex-col overflow-hidden`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
          className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="케이스 제목 검색"
            className={`${portalInput} min-w-[8rem] flex-1`}
          />
          <select value={assignedBy} onChange={(e) => setAssignedBy(e.target.value)} className={`${portalSelect} py-2`}>
            <option value="">팀 전체</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === myId ? ' (나)' : ''}
              </option>
            ))}
          </select>
          <button type="submit" className={portalBtnSecondary} disabled={loading}>
            {loading ? '…' : '검색'}
          </button>
        </form>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
          <span>{rows.length}건</span>
          <button type="button" onClick={() => setCreating(true)} className="font-semibold text-indigo-600 hover:underline">
            + 신규 케이스
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${
                selectedId === c.id ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="font-medium text-slate-900">{c.subject}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span>{c.client_name || '거래처 없음'}</span>
                {c.status && <span className="rounded bg-slate-100 px-1.5 py-0.5">{c.status}</span>}
                {c.due_date && <span>~{c.due_date}</span>}
                <span>{c.assigned_name}</span>
              </div>
            </button>
          ))}
          {!loading && rows.length === 0 && <div className="px-3 py-10 text-center text-sm text-slate-500">케이스가 없습니다.</div>}
        </div>
      </div>

      <div>
        {selectedId ? (
          <CaseDetailView key={selectedId} id={selectedId} team={team} myId={myId} notify={notify} onSaved={load} />
        ) : (
          <div className={portalEmptyState}>왼쪽에서 케이스를 선택하세요.</div>
        )}
      </div>

      {creating && (
        <CaseCreateModal
          team={team}
          myId={myId}
          notify={notify}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            if (id) setSelectedId(id);
            void load();
          }}
        />
      )}
    </div>
  );
}

const CASE_FIELD_ORDER: string[] = [
  '거래처명',
  '수행자',
  '협력자',
  '팔로워',
  '진행상태',
  '우선순위',
  '업무의뢰경로',
  '업무분류1',
  '업무분류2',
  '시작일',
  '시작시간',
  '마감일',
  '마감시간',
  '업무태그',
  '상위케이스',
];

type MetaOpt = { id: string; name: string };
type CaseType = { id: string; name: string; code: string; parent_code: string };
type CaseMeta = { statuses: MetaOpt[]; priorities: MetaOpt[]; requestRoutes: MetaOpt[]; caseTypes: CaseType[] };

let _metaCache: CaseMeta | null = null;
async function loadCaseMeta(): Promise<CaseMeta> {
  if (_metaCache) return _metaCache;
  const res = await fetch('/api/bluehole/meta', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '메타 조회 실패');
  _metaCache = data;
  return data;
}

function level1Types(meta: CaseMeta): CaseType[] {
  return meta.caseTypes.filter((t) => !t.parent_code);
}
function level2Types(meta: CaseMeta, parentId: string): CaseType[] {
  const parent = meta.caseTypes.find((t) => t.id === parentId);
  if (!parent) return [];
  return meta.caseTypes.filter((t) => t.parent_code && t.parent_code === parent.code);
}

function CaseTypeSelect({
  meta,
  type1,
  type2,
  onChange,
}: {
  meta: CaseMeta;
  type1: string;
  type2: string;
  onChange: (t1: string, t2: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <select
        value={type1}
        onChange={(e) => onChange(e.target.value, '')}
        className={`${portalSelect} flex-1 py-1.5`}
      >
        <option value="">업무분류1</option>
        {level1Types(meta).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        value={type2}
        onChange={(e) => onChange(type1, e.target.value)}
        className={`${portalSelect} flex-1 py-1.5`}
        disabled={!type1}
      >
        <option value="">업무분류2</option>
        {type1 &&
          level2Types(meta, type1).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
    </div>
  );
}

function CaseDetailView({
  id,
  team,
  myId,
  notify,
  onSaved,
}: {
  id: string;
  team: TeamMember[];
  myId: string;
  notify: (m: string, e?: boolean) => void;
  onSaved: () => void;
}) {
  void myId;
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<CaseMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bluehole/cases/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setDetail(data.case);
      setCodes(data.codes || {});
    } catch (e) {
      notify(e instanceof Error ? e.message : '조회 실패', true);
    } finally {
      setLoading(false);
    }
  }, [id, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = useCallback(async () => {
    try {
      const m = meta || (await loadCaseMeta());
      setMeta(m);
      setDraft({ ...codes });
      setEditing(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : '메타 조회 실패', true);
    }
  }, [meta, codes, notify]);

  const save = useCallback(async () => {
    const changes: Record<string, string> = {};
    for (const k of Object.keys(draft)) {
      if ((draft[k] ?? '') !== (codes[k] ?? '')) changes[k] = draft[k] ?? '';
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    if (!confirm(`케이스에 ${Object.keys(changes).length}개 항목을 반영합니다. 진행할까요?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bluehole/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수정 실패');
      const warn = (data.warnings || []).length ? ` (경고: ${data.warnings.join(', ')})` : '';
      notify(`반영 완료: ${(data.successCols || []).length}개 항목${warn}`);
      setEditing(false);
      await load();
      onSaved();
    } catch (e) {
      notify(e instanceof Error ? e.message : '수정 실패', true);
    } finally {
      setSaving(false);
    }
  }, [draft, codes, id, notify, load, onSaved]);

  const fields = useMemo(() => (detail ? CASE_FIELD_ORDER.filter((k) => detail[k]) : []), [detail]);

  if (loading) return <div className={portalEmptyState}>불러오는 중…</div>;
  if (!detail) return <div className={portalEmptyState}>케이스 정보를 불러오지 못했습니다.</div>;

  return (
    <div className={`${portalCard} p-5`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{detail.title || '(제목 없음)'}</h2>
        <div className="flex items-center gap-2">
          <a href={`${BLUEHOLE_HOST}/case/info/${detail.id}`} target="_blank" rel="noreferrer" className={portalBtnSecondary}>
            열기 ↗
          </a>
          {editing ? (
            <>
              <button type="button" onClick={() => setEditing(false)} className={portalBtnSecondary} disabled={saving}>
                취소
              </button>
              <button type="button" onClick={save} className={portalBtnPrimary} disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <button type="button" onClick={startEdit} className={portalBtnPrimary}>
              수정
            </button>
          )}
        </div>
      </div>

      {editing && meta ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-slate-500">제목</span>
            <input
              value={draft.subject ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              className={portalInput}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">진행상태</span>
            <select value={draft.status ?? ''} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className={portalSelect}>
              <option value="">(미지정)</option>
              {meta.statuses.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">우선순위</span>
            <select value={draft.priority ?? ''} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className={portalSelect}>
              <option value="">(미지정)</option>
              {meta.priorities.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">수행자</span>
            <select value={draft.assigned_by ?? ''} onChange={(e) => setDraft((d) => ({ ...d, assigned_by: e.target.value }))} className={portalSelect}>
              <option value="">(미지정)</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">업무의뢰경로</span>
            <select value={draft.request_route ?? ''} onChange={(e) => setDraft((d) => ({ ...d, request_route: e.target.value }))} className={portalSelect}>
              <option value="">(미지정)</option>
              {meta.requestRoutes.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">시작일</span>
            <input type="date" value={draft.start_date ?? ''} onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))} className={portalInput} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">마감일</span>
            <input type="date" value={draft.due_date ?? ''} onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))} className={portalInput} />
          </label>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-slate-500">업무분류</span>
            <CaseTypeSelect
              meta={meta}
              type1={draft.case_type1 ?? ''}
              type2={draft.case_type2 ?? ''}
              onChange={(t1, t2) => setDraft((d) => ({ ...d, case_type1: t1, case_type2: t2 }))}
            />
          </div>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {fields.map((k) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-sm text-slate-900">{detail[k]}</dd>
              </div>
            ))}
          </dl>
          {detail.body && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">내용</h3>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{detail.body}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CaseCreateModal({
  team,
  myId,
  notify,
  onClose,
  onCreated,
}: {
  team: TeamMember[];
  myId: string;
  notify: (m: string, e?: boolean) => void;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [meta, setMeta] = useState<CaseMeta | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ subject: '', assigned_by: myId, status: '', priority: '', start_date: '', due_date: '', request_route: '', case_type1: '', case_type2: '', description: '' });
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<ClientRow[]>([]);
  const [clientName, setClientName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadCaseMeta()
      .then(setMeta)
      .catch((e) => notify(e instanceof Error ? e.message : '메타 조회 실패', true));
  }, [notify]);

  const searchClient = useCallback(async () => {
    if (!clientQuery.trim()) return;
    try {
      const res = await fetch(`/api/bluehole/clients?q=${encodeURIComponent(clientQuery.trim())}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setClientResults(data.clients || []);
    } catch {
      /* 무시 */
    }
  }, [clientQuery]);

  const submit = useCallback(async () => {
    if (!form.subject.trim()) {
      notify('케이스 제목은 필수입니다.', true);
      return;
    }
    if (!confirm('블루홀에 케이스를 새로 생성합니다. 블루홀은 삭제 기능이 없어 영구 생성됩니다. 진행할까요?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bluehole/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      notify(`케이스 생성 완료 · #${data.newId}`);
      onCreated(data.newId);
    } catch (e) {
      notify(e instanceof Error ? e.message : '생성 실패', true);
    } finally {
      setSaving(false);
    }
  }, [form, notify, onCreated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className={`${portalCard} max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold text-slate-900">신규 케이스 생성</h2>
        <p className="mb-4 text-xs text-red-600">블루홀은 삭제 기능이 없어 생성 시 영구 반영됩니다.</p>

        {!meta ? (
          <div className={portalEmptyState}>메타 불러오는 중…</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-slate-500">제목 *</span>
              <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className={portalInput} />
            </label>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-slate-500">거래처 {clientName && <span className="text-blue-600">· {clientName}</span>}</span>
              <div className="flex gap-2">
                <input
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void searchClient();
                    }
                  }}
                  placeholder="거래처명 검색 후 선택"
                  className={`${portalInput} flex-1`}
                />
                <button type="button" onClick={searchClient} className={portalBtnSecondary}>
                  검색
                </button>
              </div>
              {clientResults.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200">
                  {clientResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, client_id: c.id }));
                        setClientName(c.name);
                        setClientResults([]);
                        setClientQuery('');
                      }}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      {c.name} <span className="text-xs text-slate-400">{c.business_number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">수행자</span>
              <select value={form.assigned_by} onChange={(e) => setForm((f) => ({ ...f, assigned_by: e.target.value }))} className={portalSelect}>
                <option value="">(미지정)</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.id === myId ? ' (나)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">진행상태</span>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={portalSelect}>
                <option value="">(미지정)</option>
                {meta.statuses.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">우선순위</span>
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={portalSelect}>
                <option value="">(미지정)</option>
                {meta.priorities.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">업무의뢰경로</span>
              <select value={form.request_route} onChange={(e) => setForm((f) => ({ ...f, request_route: e.target.value }))} className={portalSelect}>
                <option value="">(미지정)</option>
                {meta.requestRoutes.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">시작일</span>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className={portalInput} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">마감일</span>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className={portalInput} />
            </label>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-slate-500">업무분류</span>
              <CaseTypeSelect
                meta={meta}
                type1={form.case_type1}
                type2={form.case_type2}
                onChange={(t1, t2) => setForm((f) => ({ ...f, case_type1: t1, case_type2: t2 }))}
              />
            </div>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-slate-500">내용</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={4}
                className={`${portalInput} resize-y`}
              />
            </label>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={portalBtnSecondary} disabled={saving}>
            취소
          </button>
          <button type="button" onClick={submit} className={portalBtnPrimary} disabled={saving || !meta}>
            {saving ? '생성 중…' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
