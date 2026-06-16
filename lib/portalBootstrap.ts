import { isPortalAdmin, requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clientsDb';
import { listClientSearchIndex } from '@/lib/clientSearchIndex';
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

  const [tasks, activeClients, searchIndex, inquiries, processes] = await Promise.all([
    listDashboardTasks(user.name),
    listClients({
      status: 'active',
      mineOnly,
      userId: user.id,
      userName: user.name,
    }),
    listClientSearchIndex(),
    listInquiries(),
    listIntakeProcesses(),
  ]);

  return {
    fetchedAt: Date.now(),
    tasks,
    homeStats: statsFromClients(activeClients),
    clients: activeClients,
    searchIndex,
    inquiries,
    processes,
  };
}
