'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'busan-login-id';

type LoginUser = { loginId: string; name: string; role: string };

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [users, setUsers] = useState<LoginUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/login-users')
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(data => {
        const list = (data.users ?? []) as LoginUser[];
        setUsers(list);
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && list.some(u => u.loginId === saved)) {
          setLoginId(saved);
        } else if (list.length === 1) {
          setLoginId(list[0].loginId);
        }
      })
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  const selectUser = useCallback((id: string) => {
    setLoginId(id);
    setPin('');
    setError(null);
  }, []);

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
        body: JSON.stringify({ loginId, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        setPin('');
        return;
      }
      localStorage.setItem(STORAGE_KEY, loginId);
      router.replace(next);
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [loginId, pin, next, router]);

  useEffect(() => {
    if (pin.length === 4 && loginId) {
      void submit();
    }
  }, [pin, loginId, submit]);

  const selected = users.find(u => u.loginId === loginId);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-8 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-300 text-center">Busan Branch</p>
        <h1 className="mt-2 text-2xl font-black text-white text-center">부산지점 포털</h1>
        <p className="mt-2 text-sm text-violet-200/70 text-center">이름 선택 후 PIN 4자리</p>

        <div className="mt-8">
          <span className="text-xs font-semibold text-violet-200">누구세요?</span>
          {usersLoading ? (
            <p className="mt-3 text-sm text-violet-200/60 text-center">불러오는 중…</p>
          ) : users.length === 0 ? (
            <p className="mt-3 text-sm text-red-300 text-center">등록된 사용자가 없습니다.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {users.map(user => {
                const active = loginId === user.loginId;
                return (
                  <button
                    key={user.loginId}
                    type="button"
                    disabled={loading}
                    onClick={() => selectUser(user.loginId)}
                    className={`rounded-xl px-2 py-3 text-sm font-bold transition active:scale-95 disabled:opacity-50 ${
                      active
                        ? 'bg-violet-500 text-white ring-2 ring-violet-300 shadow-lg shadow-violet-900/40'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {user.name}
                    {user.role === 'admin' && (
                      <span className="block text-[9px] font-semibold opacity-70 mt-0.5">admin</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
