'use client';

import { useEffect, useState } from 'react';
import {
  portalAccentSection,
  portalAlertError,
  portalBtnPrimary,
  portalInput,
  portalSectionDesc,
  portalSectionTitle,
} from '@/app/components/portal/uiClasses';

type RequestItem = {
  id: string;
  name: string;
  note: string;
  requestedByName: string;
  createdAt: string;
};

export default function LunchSpotRequestForm() {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [pending, setPending] = useState<RequestItem[]>([]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const admin = !!data?.isMaster;
        setIsAdmin(admin);
        if (admin) {
          fetch('/api/lunch/requests')
            .then(r => (r.ok ? r.json() : { items: [] }))
            .then(d => setPending(d.items ?? []))
            .catch(() => setPending([]));
        }
      })
      .catch(() => setIsAdmin(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('식당 이름을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/lunch/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '요청 실패');
      setName('');
      setNote('');
      setMessage('요청이 등록되었습니다. 반영까지 시간이 걸릴 수 있습니다.');
      if (data.isAdmin) {
        setPending(prev => [data.item, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`${portalAccentSection} mt-10`}>
      <h2 className={portalSectionTitle}>맛집 추가 요청</h2>
      <p className={portalSectionDesc}>
        목록에 없는 식당이 있으면 이름을 남겨 주세요. 확인 후 가챠 목록에 반영합니다.
      </p>
      <form onSubmit={e => void submit(e)} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">식당 이름</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: ○○국밥"
            className={`${portalInput} mt-1 w-full`}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">메모 (선택)</span>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="위치, 추천 메뉴 등"
            className={`${portalInput} mt-1 w-full`}
          />
        </label>
        {error && <p className={portalAlertError}>{error}</p>}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <button type="submit" disabled={saving} className={portalBtnPrimary}>
          {saving ? '등록 중…' : '추가 요청'}
        </button>
      </form>

      {isAdmin && pending.length > 0 && (
        <div className="mt-6 pt-4 border-t border-orange-200/60">
          <h3 className="text-sm font-semibold text-slate-800">대기 중인 요청</h3>
          <ul className="mt-2 space-y-2">
            {pending.map(item => (
              <li
                key={item.id}
                className="rounded-lg border border-orange-100/80 bg-white/80 px-3 py-2 text-xs"
              >
                <span className="font-semibold text-slate-900">{item.name}</span>
                {item.note && <span className="text-slate-600"> · {item.note}</span>}
                <span className="block portal-meta mt-0.5">
                  {item.requestedByName} · {new Date(item.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
