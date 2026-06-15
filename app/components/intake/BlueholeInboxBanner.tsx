'use client';

import Link from 'next/link';

export default function BlueholeInboxBanner({
  unlinkedCount,
  showOnlyUnlinked,
  onToggleFilter,
}: {
  unlinkedCount: number;
  showOnlyUnlinked: boolean;
  onToggleFilter: () => void;
}) {
  if (unlinkedCount === 0 && !showOnlyUnlinked) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
      <div className="flex-1 min-w-[12rem]">
        <p className="text-xs font-bold text-blue-900">블루홀 업체 인박스</p>
        <p className="text-[10px] text-blue-800/70 mt-0.5">
          {unlinkedCount > 0
            ? `블루홀 미연결 유입 ${unlinkedCount}건 — 업체 번호(#11364)를 입력해 주세요.`
            : '블루홀 미연결 필터 적용 중'}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggleFilter}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg ${
          showOnlyUnlinked ? 'bg-blue-600 text-white' : 'bg-white border border-blue-200 text-blue-800'
        }`}
      >
        {showOnlyUnlinked ? '전체 보기' : `미연결만 (${unlinkedCount})`}
      </button>
      <Link
        href="https://bluehole.world"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-semibold text-blue-700 hover:underline"
      >
        블루홀 열기 →
      </Link>
    </div>
  );
}
