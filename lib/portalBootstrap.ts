import { isPortalAdmin, requireUser } from '@/lib/auth';
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
  const mineOnly = !isPortalAdmin(user);
  const accessFilter = mineOnly
    ? { mineOnly: true as const, userId: user.id, userName: user.name }
    : {};

  const [tasks, activeClients, inquiries, processes, churnRecords, churnMissingClients] = await Promise.all([
    listDashboardTasks(user.name),
    listClients({
      status: 'active',
      mineOnly,
      userId: user.id,
      userName: user.name,
    }),
    listInquiries(),
    listIntakeProcesses(),
    listChurnRecords(accessFilter),
    listChurnedClientsWithoutRecord(accessFilter),
  ]);

  return {
    fetchedAt: Date.now(),
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
  const user = await requireUser();
  const mineOnly = !isPortalAdmin(user);
  const { listClientSearchIndex } = await import('@/lib/clientSearchIndex');
  return listClientSearchIndex(
    mineOnly ? { mineOnly: true, userId: user.id, userName: user.name } : {},
  );
}
