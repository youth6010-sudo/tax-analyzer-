import { notFound } from 'next/navigation';
import ClientDetailPage from '../../components/clients/ClientDetailPage';
import ClientRelatedLinks from '../../components/ClientRelatedLinks';
import PortalPageShell from '../../components/portal/PortalPageShell';
import { requireUserPage } from '@/lib/auth';
import { canEditClient } from '@/lib/clientAccess';
import { getClientById } from '@/lib/clientsDb';
import { getClientRelatedCounts } from '@/lib/workbookDb';
import { listPersonalChecklistForClient } from '@/lib/personalChecklist';

export const dynamic = 'force-dynamic';

export default async function ClientDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const canEdit = canEditClient(user, client);

  const [related, checklistItems] = await Promise.all([
    getClientRelatedCounts(client.id, client.companyName),
    listPersonalChecklistForClient(client.id, { includeCompleted: false }).catch(e => {
      console.error('[client-detail] checklist load failed', e);
      return [] as Awaited<ReturnType<typeof listPersonalChecklistForClient>>;
    }),
  ]);

  return (
    <PortalPageShell className="!py-4">
      <ClientDetailPage
        client={client}
        canEdit={canEdit}
        relatedSlot={
          <ClientRelatedLinks
            clientId={client.id}
            initial={related}
            checklistItems={checklistItems}
          />
        }
      />
    </PortalPageShell>
  );
}
