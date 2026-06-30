'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PinChangeModalProps {
  open: boolean;
  onClose: () => void;
}

const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

const pinInputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-center text-lg font-bold tracking-[0.5em] text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200';

export default function PinChangeModal({ open, onClose }: PinChangeModalProps) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setError(null);
      setSaving(false);
      setDone(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open]);

  const submit = async () => {
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
      setError('PIN 4자리를 모두 입력해 주세요.');
      return;
    }
    if (newPin === currentPin) {
      setError('새 PIN은 현재 PIN과 달라야 합니다.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('새 PIN 확인이 일치하지 않습니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'PIN을 변경하지 못했습니다.');
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN을 변경하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="닫기" onClick={onClose} />
      <div className="relative w-full max-w-xs rounded-2xl bg-white shadow-xl border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900">PIN 변경</h2>

        {done ? (
          <div className="mt-6 text-center">
            <p className="text-sm text-emerald-700 font-semibold">PIN이 변경되었습니다.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={e => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">현재 PIN</span>
              <input
                ref={firstRef}
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={currentPin}
                onChange={e => {
                  setCurrentPin(onlyDigits(e.target.value));
                  setError(null);
                }}
                placeholder="••••"
                className={`mt-1 ${pinInputCls}`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">새 PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={newPin}
                onChange={e => {
                  setNewPin(onlyDigits(e.target.value));
                  setError(null);
                }}
                placeholder="••••"
                className={`mt-1 ${pinInputCls}`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500">새 PIN 확인</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={confirmPin}
                onChange={e => {
                  setConfirmPin(onlyDigits(e.target.value));
                  setError(null);
                }}
                placeholder="••••"
                className={`mt-1 ${pinInputCls}`}
              />
            </label>

            {error && <p className="text-sm text-red-600 text-center">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '변경 중…' : 'PIN 변경'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              취소
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
