'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface BlueholeAccountModalProps {
  open: boolean;
  onClose: () => void;
}

type AccountState = { loginId: string; configured: boolean; fallbackAvailable: boolean };

const inputCls =
  'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200';

export default function BlueholeAccountModal({ open, onClose }: BlueholeAccountModalProps) {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bluehole/account', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as AccountState & { error?: string };
      if (!res.ok) throw new Error(data.error ?? '계정 정보를 불러오지 못했습니다.');
      setAccount(data);
      setLoginId(data.loginId || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '계정 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setPassword('');
      setOkMsg(null);
      setError(null);
      void load();
    }
  }, [open, load]);

  const save = async () => {
    if (!loginId.trim() || !password) {
      setError('아이디와 비밀번호를 모두 입력하세요.');
      return;
    }
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/bluehole/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: loginId.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setOkMsg(`블루홀 계정 연결 완료${data.name ? ` · ${data.name}` : ''}`);
      setPassword('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('등록된 블루홀 계정을 해제할까요?')) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/bluehole/account', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? '해제 실패');
      }
      setOkMsg('블루홀 계정을 해제했습니다.');
      setPassword('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '해제 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="닫기" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900">내 블루홀 계정</h2>
        <p className="mt-1 text-xs text-gray-500">
          담당자별 블루홀 로그인 정보입니다. 저장 시 블루홀에 로그인되는지 먼저 확인합니다.
        </p>

        <div className="mt-3">
          {account?.configured ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              연결됨 · {account.loginId}
            </span>
          ) : account?.fallbackAvailable ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              공용 계정 사용 중 (개인 계정 미등록)
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">미등록</span>
          )}
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">블루홀 아이디(이메일)</span>
            <input
              type="text"
              autoComplete="username"
              value={loginId}
              onChange={e => {
                setLoginId(e.target.value);
                setError(null);
              }}
              placeholder="example@domain.com"
              className={inputCls}
              disabled={loading || saving}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">블루홀 비밀번호</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={account?.configured ? '변경 시에만 입력' : '비밀번호'}
              className={inputCls}
              disabled={loading || saving}
            />
          </label>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          {okMsg && <p className="text-sm text-emerald-700 text-center font-semibold">{okMsg}</p>}

          <button
            type="submit"
            disabled={loading || saving}
            className="w-full py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : account?.configured ? '계정 갱신' : '계정 연결'}
          </button>

          <div className="flex gap-2">
            {account?.configured && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                className="flex-1 py-2 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                연결 해제
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              닫기
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
