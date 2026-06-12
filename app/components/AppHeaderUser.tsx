'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PinChangeModal from './PinChangeModal';

interface MeUser {
  id: string;
  loginId: string;
  name: string;
  role: string;
}

export default function AppHeaderUser() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <span className="hidden sm:inline text-xs font-semibold text-gray-600">{user.name}</span>
        <button
          type="button"
          onClick={() => setPinModalOpen(true)}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          PIN 변경
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="세무법인청년들"
          className="h-12 sm:h-14 w-auto max-h-14 object-contain shrink-0 border-l border-gray-100 pl-3 ml-1"
        />
        <button
          type="button"
          onClick={() => void logout()}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          로그아웃
        </button>
      </div>
      <PinChangeModal open={pinModalOpen} onClose={() => setPinModalOpen(false)} />
    </>
  );
}
