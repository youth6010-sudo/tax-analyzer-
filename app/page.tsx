import Link from 'next/link';
import HomeTasksSidebar from './components/dashboard/HomeTasksSidebar';
import HomeWelcomeSection from './components/dashboard/HomeWelcomeSection';
import MyClientsBoard from './components/dashboard/MyClientsBoard';
import PortalPageShell from './components/portal/PortalPageShell';
import { portalMain } from './components/portal/uiClasses';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TOOLS: {
  href: string;
  title: string;
  description: string;
  emoji: string;
  disabled?: boolean;
}[] = [
  {
    href: '/tax/comprehensive',
    title: '종합소득세 분석',
    description: '단순경비율·실제 소득율 비교, 시뮬레이션',
    emoji: '📊',
  },
  {
    href: '/tools/notice-generator',
    title: '세무 신고 안내 문구 생성기',
    description: '세목·기간 선택 → 마감일 자동 계산 + 안내문 생성',
    emoji: '🧾',
  },
  {
    href: '/gacha',
    title: '가챠머신',
    description: '점심 맛집 뽑기 · 담당자 뽑기 — 3D 캡슐 가챠',
    emoji: '🎰',
  },
];

export default async function HomePage() {
  const user = await requireUser();

  return (
    <PortalPageShell bare>
      <HomeTasksSidebar>
        <div className="flex-1 bg-gradient-to-b from-sky-50 via-white to-blue-50/40">
          <div className={`${portalMain} space-y-8 w-full`}>
            {/* 브랜드 헤더 — 안내 문구 생성기와 동일 톤, 파란 계열 */}
            <header className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm shadow-blue-100/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/b-system-icon.png" alt="청년들 B-System" className="h-8 w-8 object-contain" />
              </span>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-800 sm:text-xl">
                  청년들 B-System
                </h1>
                <p className="text-xs text-slate-500 sm:text-sm">
                  세무법인청년들 부산지점 업무 포털
                </p>
              </div>
            </header>

            {/* 상단 밴드: 인사(좌) + 도구(우, 같은 높이 박스 안에 배치) */}
            <section className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="rounded-2xl border border-blue-100 bg-white/80 p-5 shadow-sm shadow-blue-100/40 sm:p-6">
                <HomeWelcomeSection userName={user.name} />
              </div>

              <div className="flex max-h-[20rem] min-h-[14rem] flex-col rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm shadow-blue-100/40">
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold tracking-tight text-slate-800">
                  <span aria-hidden>🧰</span> 도구
                </h2>
                <div className="-mr-1 grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto pr-1">
                  {TOOLS.map(tool => {
                    const inner = (
                      <>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-blue-200 text-base shadow-sm">
                          {tool.emoji}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-800">
                            {tool.title}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                            {tool.description}
                          </span>
                        </span>
                      </>
                    );
                    const cardClass =
                      'flex items-start gap-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-3 transition-all hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/60';

                    if (tool.disabled) {
                      return (
                        <div key={tool.href} className={`${cardClass} pointer-events-none opacity-75`}>
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
              </div>
            </section>

            {/* 내 수임처: 좌 법인 / 우 개인 */}
            <MyClientsBoard />
          </div>
        </div>
      </HomeTasksSidebar>
    </PortalPageShell>
  );
}
