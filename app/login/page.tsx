'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { clearPortal } from '@/app/utils/portalStore';

const STORAGE_KEY = 'busan-login-id';

type LoginUser = {
  loginId: string;
  name: string;
  role: string;
  canChooseAdminMode?: boolean;
  isDeveloperLogin?: boolean;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [users, setUsers] = useState<LoginUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 10_000);
    fetch('/api/auth/login-users', { signal: ac.signal })
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(data => {
        const list = (data.users ?? []) as LoginUser[];
        setUsers(list);
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && list.some(u => u.loginId === saved)) {
          setLoginId(saved);
        }
      })
      .catch(() => setUsers([]))
      .finally(() => {
        window.clearTimeout(timer);
        setUsersLoading(false);
      });
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const selectUser = useCallback((id: string) => {
    setLoginId(id);
    setPin('');
    setError(null);
    setListOpen(false);
    const picked = users.find(u => u.loginId === id);
    setAdminMode(!!picked?.isDeveloperLogin);
  }, [users]);

  const appendPin = useCallback((digit: string) => {
    setPin(p => (p.length < 4 ? p + digit : p));
    setError(null);
  }, []);

  const backspace = useCallback(() => {
    setPin(p => p.slice(0, -1));
  }, []);

  const submit = useCallback(async () => {
    if (!loginId || pin.length !== 4) {
      setError('사용자를 선택하고 PIN 4자리를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, pin, adminMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        setPin('');
        return;
      }
      localStorage.setItem(STORAGE_KEY, loginId);
      clearPortal();
      router.replace(next);
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [loginId, pin, adminMode, next, router]);

  useEffect(() => {
    if (pin.length === 4 && loginId) {
      void submit();
    }
  }, [pin, loginId, submit]);

  const selected = users.find(u => u.loginId === loginId);
  const showAdminModeChoice = !!selected?.canChooseAdminMode;
  const isDeveloperLogin = !!selected?.isDeveloperLogin;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-8 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-300 text-center">Busan Branch</p>
        <h1 className="mt-2 text-2xl font-black text-white text-center">부산지점 포털</h1>
        <p className="mt-2 text-sm text-violet-200/70 text-center">이름 선택 후 PIN 4자리</p>

        <div className="mt-8" ref={pickerRef}>
          <span className="text-xs font-semibold text-violet-200">누구세요?</span>
          {usersLoading ? (
            <p className="mt-3 text-sm text-violet-200/60 text-center">불러오는 중…</p>
          ) : users.length === 0 ? (
            <p className="mt-3 text-sm text-red-300 text-center">등록된 사용자가 없습니다.</p>
          ) : (
            <div className="mt-3 relative">
              <button
                type="button"
                disabled={loading}
                aria-expanded={listOpen}
                aria-haspopup="listbox"
                onClick={() => setListOpen(open => !open)}
                className="w-full flex items-center justify-between gap-2 rounded-xl px-4 py-3.5 text-left text-sm font-bold text-white bg-white/10 hover:bg-white/15 ring-1 ring-white/10 transition disabled:opacity-50"
              >
                <span className={selected ? 'text-white' : 'text-violet-200/60'}>
                  {selected ? selected.name : '이름을 선택하세요'}
                </span>
                <svg
                  className={`w-5 h-5 shrink-0 text-violet-300 transition-transform ${listOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {listOpen && (
                <ul
                  role="listbox"
                  aria-label="로그인 사용자"
                  className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-md shadow-xl py-1"
                >
                  {users.map(user => {
                    const checked = loginId === user.loginId;
                    return (
                      <li key={user.loginId} role="option" aria-selected={checked}>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => selectUser(user.loginId)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left transition ${
                            checked
                              ? 'bg-violet-600/40 text-white'
                              : 'text-violet-100 hover:bg-white/10'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                              checked ? 'border-violet-300 bg-violet-500' : 'border-white/30 bg-transparent'
                            }`}
                            aria-hidden
                          >
                            {checked && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          {user.name}
                          {user.isDeveloperLogin && (
                            <span className="ml-1.5 text-[10px] font-bold text-violet-300">개발자</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {loginId && (showAdminModeChoice || isDeveloperLogin) && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            {isDeveloperLogin ? (
              <p className="text-xs font-semibold text-violet-200">
                개발자 계정 — 관리자 모드로 접속됩니다
              </p>
            ) : (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={adminMode}
                  onChange={e => setAdminMode(e.target.checked)}
                  disabled={loading}
                  className="mt-0.5 h-4 w-4 rounded border-white/30 bg-white/10 text-violet-500 focus:ring-violet-400"
                />
                <span className="text-xs leading-relaxed text-violet-100">
                  <span className="font-semibold text-white">관리자 모드로 접속</span>
                  <span className="block mt-0.5 text-violet-200/80">
                    전체 데이터 조회·수정, 개발 중 메뉴(블루홀·데이터 관리 등) 사용
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        <div className={`mt-6 transition-opacity ${loginId ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <span className="text-xs font-semibold text-violet-200">
            PIN {selected ? `· ${selected.name}` : ''}
          </span>
          <div className="mt-2 flex justify-center gap-3">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 ${
                  pin.length > i ? 'bg-violet-400 border-violet-400' : 'border-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        <div className={`mt-6 grid grid-cols-3 gap-2 transition-opacity ${loginId ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'OK'].map(key => (
            <button
              key={key}
              type="button"
              disabled={loading || !loginId}
              onClick={() => {
                if (key === '←') backspace();
                else if (key === 'OK') void submit();
                else appendPin(key);
              }}
              className="rounded-xl py-3 text-lg font-bold text-white bg-white/10 hover:bg-white/20 active:scale-95 transition disabled:opacity-50"
            >
              {key}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-300 text-center">{error}</p>}
        {loading && <p className="mt-2 text-sm text-violet-200 text-center">로그인 중…</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginForm />
    </Suspense>
  );
}
