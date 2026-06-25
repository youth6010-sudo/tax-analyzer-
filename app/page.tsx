import Link from 'next/link';
import HomeLunchPreview from './components/lunch/HomeLunchPreview';
import HomeTasksSidebar from './components/dashboard/HomeTasksSidebar';
import HomeWelcomeSection from './components/dashboard/HomeWelcomeSection';
import PortalPageShell from './components/portal/PortalPageShell';
import { portalCard, portalMain, portalSectionTitle } from './components/portal/uiClasses';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TOOLS: {
  href: string;
  title: string;
  description: string;
  accent: string;
  preview?: boolean;
  disabled?: boolean;
}[] = [
  {
    href: '/tax/comprehensive',
    title: '종합소득세 분석',
    description: '업종별 단순경비율과 실제 소득율 비교, 시뮬레이션',
    accent: 'blue',
  },
  {
    href: '/tools/notice-generator',
    title: '세무 신고 안내 문구 생성기',
    description: '세목·기간 선택 → 마감일 자동 계산 + 안내문 생성',
    accent: 'blue',
  },
  {
    href: '/gacha',
    title: '가챠머신',
    description: '점심 맛집 뽑기 · 담당자 뽑기 — 3D 캡슐 가챠',
    accent: 'orange',
    preview: true,
  },
] as const;

const ACCENT: Record<string, string> = {
  blue: 'border-blue-200 hover:border-blue-300 hover:shadow-blue-100/50',
  orange: 'border-orange-200 hover:border-orange-300 hover:shadow-orange-100/50',
  gray: 'border-slate-200 opacity-75',
};

export default async function HomePage() {
  const user = await requireUser();

  return (
    <PortalPageShell bare>
      <HomeTasksSidebar>
        <div className={`${portalMain} space-y-10 w-full`}>
          <HomeWelcomeSection userName={user.name} />

          <section>
            <h2 className={`${portalSectionTitle} mb-4`}>도구</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {TOOLS.map(tool => {
                const cardClass = `block ${portalCard} p-5 transition-all ${
                  ACCENT[tool.accent] ?? ACCENT.gray
                } ${tool.disabled ? 'pointer-events-none' : 'hover:shadow-md'}`;

                  const inner = (
                    <>
                      <h3 className="text-lg font-semibold text-slate-900">{tool.title}</h3>
                      <p className="mt-2 text-sm text-slate-700 leading-relaxed">{tool.description}</p>
                      {'preview' in tool && tool.preview ? <HomeLunchPreview /> : null}
                      {!tool.disabled && (
                        <span className="mt-4 inline-flex text-sm font-medium text-slate-700">
                          열기 →
                        </span>
                      )}
                    </>
                  );

                  if (tool.disabled) {
                    return (
                      <div key={tool.href} className={cardClass}>
                        {inner}
                      </div>
                    );
                  }

                  return (
                    <Link key={tool.href} href={tool.href} className={cardClass}>
                      {inner}
                    </Link>
                  );
                })}
            </div>
          </section>
        </div>
      </HomeTasksSidebar>
    </PortalPageShell>
  );
}
