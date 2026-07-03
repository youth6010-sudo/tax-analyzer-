'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PinChangeModal from './PinChangeModal';
import BlueholeAccountModal from './BlueholeAccountModal';
import { clearPortal } from '@/app/utils/portalStore';

interface MeUser {
  id: string;
  loginId: string;
  name: string;
  role: string;
  adminMode?: boolean;
}

export default function AppHeaderUser() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [canToggleAdminMode, setCanToggleAdminMode] = useState(false);
  const [adminModeBusy, setAdminModeBusy] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [bhModalOpen, setBhModalOpen] = useState(false);

  const loadMe = () => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user) setUser(data.user);
        setCanToggleAdminMode(!!data?.canToggleAdminMode);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadMe();
  }, []);

  const toggleAdminMode = async () => {
    if (!user || adminModeBusy) return;
    const next = !user.adminMode;
    setAdminModeBusy(true);
    try {
      const res = await fetch('/api/auth/admin-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminMode: next }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setUser(data.user);
      clearPortal();
      router.refresh();
    } finally {
      setAdminModeBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    clearPortal();
    router.push('/login');
    router.refresh();
  };

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <span className="hidden sm:inline text-xs font-semibold text-gray-600">
          {user.name}
          {user.adminMode && user.loginId === 'ria' && (
            <span className="ml-1 rounded bg-violet-100 px-1 py-px text-[10px] font-bold text-violet-700">
              관리자
            </span>
          )}
        </span>
        {canToggleAdminMode && (
          <button
            type="button"
            onClick={() => void toggleAdminMode()}
            disabled={adminModeBusy}
            className={[
              'text-xs font-semibold px-2 py-1 rounded-lg transition-colors',
              user.adminMode
                ? 'text-violet-700 bg-violet-50 hover:bg-violet-100'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
            ].join(' ')}
            title="개발·관리 메뉴 및 전체 데이터 수정"
          >
            {adminModeBusy ? '변경 중…' : user.adminMode ? '관리자 모드' : '일반 모드'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPinModalOpen(true)}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          PIN 변경
        </button>
        <button
          type="button"
          onClick={() => setBhModalOpen(true)}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          블루홀 계정
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          로그아웃
        </button>
      </div>
      <PinChangeModal open={pinModalOpen} onClose={() => setPinModalOpen(false)} />
      <BlueholeAccountModal open={bhModalOpen} onClose={() => setBhModalOpen(false)} />
    </>
  );
}
