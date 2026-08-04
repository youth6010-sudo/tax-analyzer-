type Props = { name: string; className?: string };

/** 계산기 — 디스플레이 + 2×2 연산(＋－×＝), 사이드 메뉴와 동일한 라인 아이콘 */
export function CalculatorGridIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={`${className} shrink-0`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="2" width="14" height="20" rx="2.5" />
      <rect x="7.5" y="4.5" width="9" height="4" rx="1" />
      <path d="M8.25 13.25h2.5M9.5 12v2.5" />
      <path d="M14.25 13.25h2.5" />
      <path d="M8.4 17.1l2.2 2.2M10.6 17.1l-2.2 2.2" />
      <path d="M14.25 17.25h2.5M14.25 18.75h2.5" />
    </svg>
  );
}

export default function SidebarNavIcon({ name, className = 'h-4 w-4' }: Props) {
  const common = `${className} shrink-0`;
  switch (name) {
    case 'dashboard':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case 'youth-id':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <circle cx="8" cy="12" r="2" />
          <path d="M14 10h5M14 14h5" />
        </svg>
      );
    case 'clients':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-4h6v4" />
        </svg>
      );
    case 'clients-directory':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'intake':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M22 11h-6" />
        </svg>
      );
    case 'churn':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 11h-6" />
        </svg>
      );
    case 'nts-monitor':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
    case 'mail-ledger':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 7L2 7" />
        </svg>
      );
    case 'bluehole':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
        </svg>
      );
    case 'filing-check':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'notice-generator':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      );
    case 'nhis-branches':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
          <path d="M11 8v6M8 11h6" />
        </svg>
      );
    case 'comprehensive':
      return <CalculatorGridIcon className={className} />;
    case 'gacha':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M12 8V5M8 5h8M7 13h2M15 13h2M9 17h6" />
        </svg>
      );
    case 'gacha-manager':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 11l-2 2-1-1" />
        </svg>
      );
    case 'backup':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      );
    case 'unlinked':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          <path d="m8 8 8 8" />
        </svg>
      );
    case 'data-import':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5M12 15V3" />
        </svg>
      );
    case 'data-reset':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      );
    case 'arrears':
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

const HREF_ICON: Record<string, string> = {
  '/calendar': 'calendar',
  '/youth-ids': 'youth-id',
  '/clients': 'clients',
  '/clients/directory': 'clients-directory',
  '/clients/review-sheet': 'filing-check',
  '/clients/intake': 'intake',
  '/clients/churn': 'churn',
  '/clients/nts-monitor': 'nts-monitor',
  '/mail-ledger': 'mail-ledger',
  '/bluehole': 'bluehole',
  '/clients/filing-check': 'filing-check',
  '/tools/notice-generator': 'notice-generator',
  '/tools/nhis-branches': 'nhis-branches',
  '/tax/comprehensive': 'comprehensive',
  '/gacha': 'gacha',
  '/gacha?tab=manager': 'gacha-manager',
  '/admin/backup': 'backup',
  '/admin/bluehole-unlinked': 'unlinked',
  '/admin/review-client-links': 'unlinked',
  '/admin/data-import': 'data-import',
  '/admin/data-reset': 'data-reset',
  '/arrears': 'arrears',
};

export function iconForHref(href: string): string {
  return HREF_ICON[href] ?? 'dashboard';
}

/** 페이지 상단 헤더용 — 브랜드 블루 톤 */
export function PageHeaderIcon({ name }: { name: string }) {
  return (
    <span
      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100/70 bg-blue-50/45 text-[#4b6cb7] shadow-none"
      aria-hidden
    >
      <SidebarNavIcon name={name} className="h-5 w-5" />
    </span>
  );
}
