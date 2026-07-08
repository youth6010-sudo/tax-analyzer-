import { isDataViewer, requireUser } from '@/lib/auth';
import { listChurnRecords, listChurnedClientsWithoutRecord, listClients } from '@/lib/clientsDb';
import { listDashboardTasks } from '@/lib/dashboardTasks';
import { listInquiries, listIntakeProcesses } from '@/lib/workbookDb';

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

  const [tasks, inquiries, processes, churnRecords, churnMissingClients] = await Promise.all([
    listDashboardTasks({ name: user.name, isAdmin: isDataViewer(user) }, 20, taskClientPool),
    listInquiries(),
    listIntakeProcesses(),
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
    inquiries,
    processes,
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
