'use client';

import { useCallback, useEffect, useState } from 'react';

type Step = 'current' | 'new' | 'confirm';

const STEP_LABEL: Record<Step, string> = {
  current: '현재 PIN',
  new: '새 PIN',
  confirm: '새 PIN 확인',
};

interface PinChangeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PinChangeModal({ open, onClose }: PinChangeModalProps) {
  const [step, setStep] = useState<Step>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const reset = useCallback(() => {
    setStep('current');
    setCurrentPin('');
    setNewPin('');
    setPin('');
    setError(null);
    setSaving(false);
    setDone(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const activeValue = pin;

  const appendPin = (digit: string) => {
    setPin(p => (p.length < 4 ? p + digit : p));
    setError(null);
  };

  const backspace = () => setPin(p => p.slice(0, -1));

  const advanceStep = useCallback(() => {
    if (pin.length !== 4) {
      setError('PIN 4자리를 입력해 주세요.');
      return;
    }

    if (step === 'current') {
      setCurrentPin(pin);
      setPin('');
      setStep('new');
      return;
    }

    if (step === 'new') {
      if (pin === currentPin) {
        setError('새 PIN은 현재 PIN과 달라야 합니다.');
        setPin('');
        return;
      }
      setNewPin(pin);
      setPin('');
      setStep('confirm');
      return;
    }

    if (pin !== newPin) {
      setError('새 PIN 확인이 일치하지 않습니다.');
      setPin('');
      return;
    }
  }, [pin, step, currentPin, newPin]);

  useEffect(() => {
    if (pin.length !== 4) return;

    if (step === 'confirm') {
      void (async () => {
        if (pin !== newPin) {
          setError('새 PIN 확인이 일치하지 않습니다.');
          setPin('');
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
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 401) {
              setError(data.error ?? '현재 PIN이 올바르지 않습니다.');
              reset();
              setStep('current');
              return;
            }
            throw new Error(data.error ?? '변경 실패');
          }
          setDone(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'PIN을 변경하지 못했습니다.');
          setPin('');
        } finally {
          setSaving(false);
        }
      })();
      return;
    }

    const t = setTimeout(advanceStep, 150);
    return () => clearTimeout(t);
  }, [pin, step, newPin, currentPin, advanceStep, reset]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="닫기"
        onClick={onClose}
      />
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
          <>
            <p className="mt-1 text-sm text-gray-500">{STEP_LABEL[step]}</p>

            <div className="mt-4 flex justify-center gap-3">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 ${
                    activeValue.length > i ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}
                />
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '⌫'].map(key => (
                <button
                  key={key}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (key === '←') {
                      if (step === 'new') {
                        setStep('current');
                        setPin(currentPin);
                        setCurrentPin('');
                      } else if (step === 'confirm') {
                        setStep('new');
                        setPin(newPin);
                        setNewPin('');
                      } else backspace();
                    } else if (key === '⌫') backspace();
                    else appendPin(key);
                  }}
                  className="rounded-xl py-2.5 text-base font-bold text-gray-800 bg-gray-100 hover:bg-gray-200 active:scale-95 transition disabled:opacity-50"
                >
                  {key}
                </button>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
            {saving && <p className="mt-2 text-sm text-gray-500 text-center">변경 중…</p>}

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="mt-4 w-full py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              취소
            </button>
          </>
        )}
      </div>
    </div>
  );
}
