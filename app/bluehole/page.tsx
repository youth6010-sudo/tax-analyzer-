'use client';

import { useCallback, useEffect, useState } from 'react';
import PortalPageShell, {
  PortalPageHeader,
  PortalToolTabs,
} from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalAlertInfo,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalInput,
} from '@/app/components/portal/uiClasses';

type AccountState = {
  loginId: string;
  configured: boolean;
  fallbackAvailable: boolean;
};

type Tab = 'clients' | 'cases';

type ClientRow = {
  id: string;
  name: string;
  aka: string;
  business_number: string;
  branch_name: string;
  manager_name: string;
};

type CaseRow = {
  id: string;
  subject: string;
  client_name: string;
  status_code: string;
  status: string;
  priority_code: string;
  due_date: string;
  assigned_name: string;
  url: string;
};

const BLUEHOLE_HOST = 'https://bluehole.world';

export default function BlueholePage() {
  const [tab, setTab] = useState<Tab>('clients');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [searched, setSearched] = useState(false);

  const [account, setAccount] = useState<AccountState | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accLoginId, setAccLoginId] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/bluehole/account', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setAccount(data);
        setAccLoginId(data.loginId || '');
      }
    } catch {
      // 무시 — 초기 로드 실패는 화면에서 등록 유도
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const saveAccount = useCallback(async () => {
    setError('');
    setInfo('');
    if (!accLoginId.trim() || !accPassword) {
      setError('블루홀 아이디와 비밀번호를 입력하세요.');
      return;
    }
    setSavingAccount(true);
    try {
      const res = await fetch('/api/bluehole/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: accLoginId.trim(), password: accPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '계정 저장 실패');
      setInfo(`블루홀 계정 연결 완료 · ${data.name}`);
      setAccPassword('');
      setShowAccountForm(false);
      await loadAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : '계정 저장 실패');
    } finally {
      setSavingAccount(false);
    }
  }, [accLoginId, accPassword, loadAccount]);

  const removeAccount = useCallback(async () => {
    if (!confirm('등록된 블루홀 계정을 해제할까요?')) return;
    setError('');
    setInfo('');
    setSavingAccount(true);
    try {
      const res = await fetch('/api/bluehole/account', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '계정 해제 실패');
      setInfo('블루홀 계정을 해제했습니다.');
      setAccPassword('');
      await loadAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : '계정 해제 실패');
    } finally {
      setSavingAccount(false);
    }
  }, [loadAccount]);

  const call = useCallback(async (params: Record<string, string>) => {
    const usp = new URLSearchParams(params);
    const res = await fetch(`/api/bluehole/dev?${usp}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '요청 실패');
    return data;
  }, []);

  const search = useCallback(async () => {
    setError('');
    setInfo('');
    setLoading(true);
    setSearched(true);
    try {
      if (tab === 'clients') {
        if (!q.trim()) {
          setClients([]);
          setError('거래처명을 입력하세요.');
          return;
        }
        const data = await call({ type: 'clients', q: q.trim() });
        setClients(data.clients ?? []);
      } else {
        const data = await call({ type: 'cases', q: q.trim() });
        setCases(data.rows ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [tab, q, call]);

  const testConnection = useCallback(async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await fetch('/api/bluehole/ping', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '연결 실패');
      setInfo(`블루홀 연결 OK · 로그인 계정: ${data.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void search();
  };

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="블루홀 연동 (검증)"
        description="포털 서버가 블루홀에 직접 접속해 거래처·케이스를 조회합니다. (MVP · 조회 전용)"
        icon="🔗"
        actions={
          <button type="button" onClick={testConnection} className={portalBtnSecondary} disabled={loading}>
            연결 확인
          </button>
        }
      />

      <div className={`${portalCard} mb-4 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-slate-700">내 블루홀 계정</span>
            {account?.configured ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                연결됨 · {account.loginId}
              </span>
            ) : account?.fallbackAvailable ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                공용(폴백) 계정 사용 중 — 본인 계정 등록 권장
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                미등록
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAccountForm((v) => !v)}
              className={portalBtnSecondary}
              disabled={savingAccount}
            >
              {account?.configured ? '계정 변경' : '계정 등록'}
            </button>
            {account?.configured && (
              <button
                type="button"
                onClick={removeAccount}
                className={portalBtnSecondary}
                disabled={savingAccount}
              >
                해제
              </button>
            )}
          </div>
        </div>

        {showAccountForm && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <input
              type="text"
              value={accLoginId}
              onChange={(e) => setAccLoginId(e.target.value)}
              placeholder="블루홀 아이디(이메일)"
              autoComplete="off"
              className={`${portalInput} min-w-[14rem] flex-1`}
            />
            <input
              type="password"
              value={accPassword}
              onChange={(e) => setAccPassword(e.target.value)}
              placeholder="블루홀 비밀번호"
              autoComplete="new-password"
              className={`${portalInput} min-w-[12rem] flex-1`}
            />
            <button type="button" onClick={saveAccount} className={portalBtnPrimary} disabled={savingAccount}>
              {savingAccount ? '확인 중…' : '저장 및 연결'}
            </button>
            <p className="w-full text-xs text-slate-400">
              비밀번호는 서버에서 암호화(AES-GCM)되어 저장되며, 저장 전 블루홀 로그인으로 검증합니다.
            </p>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PortalToolTabs<Tab>
          tabs={[
            { id: 'clients', label: '🏢 거래처', accent: 'blue' },
            { id: 'cases', label: '📋 케이스', accent: 'indigo' },
          ]}
          value={tab}
          onChange={(id) => {
            setTab(id);
            setError('');
            setInfo('');
            setSearched(false);
          }}
        />
      </div>

      <form onSubmit={onSubmit} className={`${portalCard} mb-4 flex flex-wrap items-center gap-2 p-3`}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'clients' ? '거래처명 검색 (예: 세무)' : '케이스 제목 검색 (비우면 내 케이스)'}
          className={`${portalInput} flex-1 min-w-[12rem] max-w-md`}
        />
        <button type="submit" className={portalBtnPrimary} disabled={loading}>
          {loading ? '조회 중…' : '조회'}
        </button>
      </form>

      {info && <div className={`${portalAlertInfo} mb-4`}>{info}</div>}
      {error && <div className={`${portalAlertError} mb-4`}>{error}</div>}

      {tab === 'clients' ? (
        <ClientTable rows={clients} searched={searched} loading={loading} />
      ) : (
        <CaseTable rows={cases} searched={searched} loading={loading} />
      )}
    </PortalPageShell>
  );
}

function ClientTable({ rows, searched, loading }: { rows: ClientRow[]; searched: boolean; loading: boolean }) {
  if (loading) return null;
  if (searched && rows.length === 0) return <div className={portalEmptyState}>검색 결과가 없습니다.</div>;
  if (!searched) return <div className={portalEmptyState}>거래처명을 입력해 조회하세요.</div>;

  return (
    <div className={`${portalCard} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
            <th className="px-3 py-2.5">거래처명</th>
            <th className="px-3 py-2.5">사업자번호</th>
            <th className="px-3 py-2.5">지점</th>
            <th className="px-3 py-2.5">담당자</th>
            <th className="px-3 py-2.5">링크</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2.5 font-medium text-slate-900">
                {c.name}
                {c.aka ? <span className="ml-1 text-xs text-slate-400">({c.aka})</span> : null}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-slate-600">{c.business_number || '-'}</td>
              <td className="px-3 py-2.5 text-slate-600">{c.branch_name || '-'}</td>
              <td className="px-3 py-2.5 text-slate-600">{c.manager_name || '-'}</td>
              <td className="px-3 py-2.5">
                <a
                  href={`${BLUEHOLE_HOST}/client/info/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  열기
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaseTable({ rows, searched, loading }: { rows: CaseRow[]; searched: boolean; loading: boolean }) {
  if (loading) return null;
  if (searched && rows.length === 0) return <div className={portalEmptyState}>케이스가 없습니다.</div>;
  if (!searched) return <div className={portalEmptyState}>조회 버튼을 눌러 케이스를 불러오세요.</div>;

  return (
    <div className={`${portalCard} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
            <th className="px-3 py-2.5">#</th>
            <th className="px-3 py-2.5">제목</th>
            <th className="px-3 py-2.5">거래처</th>
            <th className="px-3 py-2.5">상태</th>
            <th className="px-3 py-2.5">마감</th>
            <th className="px-3 py-2.5">수행자</th>
            <th className="px-3 py-2.5">링크</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2.5 tabular-nums text-slate-500">{c.id}</td>
              <td className="px-3 py-2.5 font-medium text-slate-900">{c.subject}</td>
              <td className="px-3 py-2.5 text-slate-600">{c.client_name || '-'}</td>
              <td className="px-3 py-2.5 text-slate-600">{c.status || c.status_code || '-'}</td>
              <td className="px-3 py-2.5 tabular-nums text-slate-600">{c.due_date || '-'}</td>
              <td className="px-3 py-2.5 text-slate-600">{c.assigned_name || '-'}</td>
              <td className="px-3 py-2.5">
                <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  열기
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
