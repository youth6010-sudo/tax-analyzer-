import { isDataViewer, requireUser } from '@/lib/auth';
import { listChurnRecords, listChurnedClientsWithoutRecord, listClients } from '@/lib/clientsDb';
import { listDashboardTasks } from '@/lib/dashboardTasks';

const BOOTSTRAP_CACHE_MS = 60_000;
const bootstrapCache = new Map<string, { at: number; data: Awaited<ReturnType<typeof buildPortalBootstrap>> }>();
const bootstrapInflight = new Map<string, Promise<Awaited<ReturnType<typeof buildPortalBootstrap>>>>();

export type PortalHomeStats = {
  count: number;
  corporate: number;
  individual: number;
  nonBusiness: number;
  unclassified: number;
};

function statsFromClients(clients: { businessEntityType?: string | null }[]): PortalHomeStats {
  return {
    count: clients.length,
    corporate: clients.filter(c => c.businessEntityType === 'corporate').length,
    individual: clients.filter(c => c.businessEntityType === 'individual').length,
    nonBusiness: clients.filter(c => c.businessEntityType === 'nonBusiness').length,
    unclassified: clients.filter(c => !c.businessEntityType).length,
  };
}

export async function getPortalBootstrap() {
  const user = await requireUser();
  const now = Date.now();
  const cached = bootstrapCache.get(user.id);
  if (cached && now - cached.at < BOOTSTRAP_CACHE_MS) {
    return { ...cached.data, fetchedAt: now };
  }

  const inflight = bootstrapInflight.get(user.id);
  if (inflight) return inflight;

  const promise = buildPortalBootstrap(user).then(data => {
    bootstrapCache.set(user.id, { at: Date.now(), data });
    bootstrapInflight.delete(user.id);
    return data;
  }).catch(err => {
    bootstrapInflight.delete(user.id);
    throw err;
  });
  bootstrapInflight.set(user.id, promise);
  return promise;
}

async function buildPortalBootstrap(user: Awaited<ReturnType<typeof requireUser>>) {
  const mineOnly = !isDataViewer(user);
  const accessFilter = mineOnly
    ? { mineOnly: true as const, userId: user.id, userName: user.name }
    : {};

  const activeClients = await listClients({
    status: 'active',
    mineOnly,
    userId: user.id,
    userName: user.name,
  });

  const taskClientPool = activeClients.map(c => ({
    id: c.id,
    companyName: c.companyName,
    manager: c.manager,
  }));

  // 유입 inquiries/processes는 bootstrap에서 제외 — /clients/intake 이 /api/intake/* 로 로드
  const [tasks, churnRecords, churnMissingClients] = await Promise.all([
    listDashboardTasks({ name: user.name, isAdmin: isDataViewer(user) }, 20, taskClientPool),
    listChurnRecords(accessFilter),
    listChurnedClientsWithoutRecord(accessFilter),
  ]);

  return {
    fetchedAt: Date.now(),
    userId: user.id,
    tasks,
    homeStats: statsFromClients(activeClients),
    clients: activeClients,
    searchIndex: [],
    inquiries: [] as Record<string, unknown>[],
    processes: [] as Record<string, unknown>[],
    churnRecords,
    churnMissingClients,
  };
}

export async function getPortalSearchIndex() {
  // 검색은 담당과 무관하게 모든 업체를 대상으로 한다.
  await requireUser();
  const { listClientSearchIndex } = await import('@/lib/clientSearchIndex');
  return listClientSearchIndex({});
}
