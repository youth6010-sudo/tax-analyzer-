import type { ReactNode } from 'react';
import {
  portalH1,
  portalMain,
  portalMainNarrow,
  portalPage,
  portalSubtitle,
  portalToolTab,
  portalToolTabGroup,
} from '@/app/components/portal/uiClasses';

type Props = {
  children: ReactNode;
  /** main 영역 추가 class */
  className?: string;
  /** max-w-3xl — 수임처 상세 등 */
  narrow?: boolean;
  /** 좌·우 패딩 없이 본문만 (3열 셸은 유지) */
  bare?: boolean;
  /** 3열 셸 없이 전체 화면 (로그인 등) — AppChrome도 /login 은 셸을 건너뜀 */
  noChrome?: boolean;
  /** @deprecated shellLayout — 셸은 AppChrome이 담당 */
  shellLayout?: boolean;
  /** false면 상단 메뉴·검색이 스크롤 시 함께 올라감 — 레거시 */
  staticHeader?: boolean;
};

export default function PortalPageShell({
  children,
  className = '',
  narrow,
  bare,
  noChrome,
}: Props) {
  const mainClass = narrow ? portalMainNarrow : portalMain;

  // 셸(좌메뉴·우 To Do)은 root AppChrome → PortalShellLayout이 담당.
  // 여기서 다시 감싸면 페이지 이동마다 remount → "불러오는 중…" 반복.
  if (noChrome) {
    return <div className={portalPage}>{children}</div>;
  }

  if (bare) {
    return <div className={`flex min-h-0 flex-1 flex-col ${className}`.trim()}>{children}</div>;
  }

  return <main className={`${mainClass} ${className}`.trim()}>{children}</main>;
}

export function PortalPageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-7 pb-6 border-b border-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {icon != null ? (
            typeof icon === 'string' ? (
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white to-slate-50 border border-slate-200/90 text-xl shadow-sm shadow-slate-200/50"
                aria-hidden
              >
                {icon}
              </span>
            ) : (
              icon
            )
          ) : null}
          <div className="min-w-0">
            <h1 className={portalH1}>{title}</h1>
            {description ? <p className={portalSubtitle}>{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

type ToolTabAccent = 'orange' | 'indigo' | 'blue';

export function PortalToolTabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: { id: T; label: string; accent: ToolTabAccent }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`${portalToolTabGroup} ${className}`.trim()} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={portalToolTab(value === tab.id, tab.accent)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PortalLoading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div
        className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin"
        aria-hidden
      />
      <p className="portal-meta">{label}</p>
    </div>
  );
}