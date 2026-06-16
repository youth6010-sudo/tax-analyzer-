import Link from 'next/link';
import AppHeader from './components/AppHeader';
import HomeLunchPreview from './components/lunch/HomeLunchPreview';
import HomeTasksSidebar from './components/dashboard/HomeTasksSidebar';
import HomeWelcomeSection from './components/dashboard/HomeWelcomeSection';
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
    href: '/lunch',
    title: '점심 가챠머신',
    description: '3D 캡슐 뽑기로 맛집 결정 · 먹은 날·별점·리뷰 기록',
    accent: 'orange',
    preview: true,
  },
] as const;

const ACCENT: Record<string, string> = {
  blue: 'border-blue-200 hover:border-blue-300 hover:shadow-blue-100',
  orange: 'border-orange-200 hover:border-orange-300 hover:shadow-orange-100',
  gray: 'border-gray-200 opacity-75',
};

export default async function HomePage() {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 flex flex-col">
        <HomeTasksSidebar>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10 w-full">
            <HomeWelcomeSection userName={user.name} />

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-4">도구</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {TOOLS.map(tool => {
                  const cardClass = `block rounded-2xl border bg-white p-5 shadow-sm transition-all ${
                    ACCENT[tool.accent] ?? ACCENT.gray
                  } ${tool.disabled ? 'pointer-events-none' : 'hover:shadow-md'}`;

                  const inner = (
                    <>
                      <h3 className="text-lg font-bold text-gray-900">{tool.title}</h3>
                      <p className="mt-2 text-sm text-gray-600">{tool.description}</p>
                      {'preview' in tool && tool.preview ? <HomeLunchPreview /> : null}
                      {!tool.disabled && (
                        <span className="mt-4 inline-flex text-sm font-semibold text-gray-800">
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
      </main>
    </div>
  );
}
