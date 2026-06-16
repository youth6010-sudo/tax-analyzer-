'use client';

import { useEffect, useState } from 'react';

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
        const admin = data?.user?.loginId === 'charlie';
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
    <section className="mt-10 rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
      <h2 className="text-lg font-black text-gray-900">맛집 추가 요청</h2>
      <p className="mt-1 text-sm text-gray-600">
        목록에 없는 식당이 있으면 이름을 남겨 주세요. 확인 후 가챠 목록에 반영합니다.
      </p>
      <form onSubmit={e => void submit(e)} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">식당 이름</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: ○○국밥"
            className="mt-1 w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-400 focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">메모 (선택)</span>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="위치, 추천 메뉴 등"
            className="mt-1 w-full border border-orange-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-400 focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? '등록 중…' : '추가 요청'}
        </button>
      </form>

      {isAdmin && pending.length > 0 && (
        <div className="mt-6 pt-4 border-t border-orange-200/80">
          <h3 className="text-sm font-black text-gray-800">대기 중인 요청</h3>
          <ul className="mt-2 space-y-2">
            {pending.map(item => (
              <li
                key={item.id}
                className="rounded-lg border border-orange-100 bg-white px-3 py-2 text-xs"
              >
                <span className="font-bold text-gray-900">{item.name}</span>
                {item.note && <span className="text-gray-600"> · {item.note}</span>}
                <span className="block text-gray-400 mt-0.5">
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
