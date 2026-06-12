import Link from 'next/link';
import AppHeader from './components/AppHeader';
import ClientCard from './components/ClientCard';
import HomeLunchPreview from './components/lunch/HomeLunchPreview';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clientsDb';
import type { BusinessEntityType } from './types/contact';

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
  {
    href: '/tax/withholding',
    title: '원천세',
    description: '준비 중',
    accent: 'gray',
    disabled: true,
  },
  {
    href: '/tax/vat',
    title: '부가세',
    description: '준비 중',
    accent: 'gray',
    disabled: true,
  },
  {
    href: '/tax/corporate',
    title: '법인세',
    description: '준비 중',
    accent: 'gray',
    disabled: true,
  },
] as const;

const ACCENT: Record<string, string> = {
  blue: 'border-blue-200 hover:border-blue-300 hover:shadow-blue-100',
  orange: 'border-orange-200 hover:border-orange-300 hover:shadow-orange-100',
  gray: 'border-gray-200 opacity-75',
};

const ENTITY_GROUPS: { id: BusinessEntityType; label: string }[] = [
  { id: 'corporate', label: '법인' },
  { id: 'individual', label: '개인' },
  { id: 'nonBusiness', label: '비사업자' },
];

export default async function HomePage() {
  const user = await requireUser();
  const activeClients = await listClients({
    status: 'active',
    mineOnly: user.role !== 'admin',
    userId: user.id,
    userName: user.name,
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
              {user.name}님, 안녕하세요
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              부산지점 수임처 포털 · 담당 수임처 {activeClients.length}곳
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/clients" className="text-sm font-semibold text-blue-600 hover:underline">
                수임처 관리
              </Link>
              <span className="text-gray-300">·</span>
              <Link href="/clients/intake" className="text-sm font-semibold text-blue-600 hover:underline">
                유입
              </Link>
            </div>
          </div>

          {ENTITY_GROUPS.map(group => {
            const items = activeClients.filter(c => c.businessEntityType === group.id);
            if (items.length === 0) return null;
            return (
              <section key={group.id}>
                <h2 className="text-lg font-bold text-gray-900 mb-3">{group.label} ({items.length})</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(client => (
                    <ClientCard key={client.id} client={client} />
                  ))}
                </div>
              </section>
            );
          })}

          {activeClients.filter(c => !c.businessEntityType).length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">
                미분류 ({activeClients.filter(c => !c.businessEntityType).length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeClients
                  .filter(c => !c.businessEntityType)
                  .map(client => (
                    <ClientCard key={client.id} client={client} />
                  ))}
              </div>
            </section>
          )}

          {activeClients.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
              <p className="text-gray-600">담당 active 수임처가 없습니다.</p>
              <Link
                href="/clients/intake?tab=consultation"
                className="mt-3 inline-flex text-sm font-bold text-blue-600 hover:underline"
              >
                신규상담 등록 →
              </Link>
            </div>
          )}

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
      </main>
    </div>
  );
}
