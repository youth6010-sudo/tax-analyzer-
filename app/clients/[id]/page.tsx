import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ClientDetailPage from '../../components/clients/ClientDetailPage';
import ClientRelatedLinks from '../../components/ClientRelatedLinks';
import PortalPageShell from '../../components/portal/PortalPageShell';
import { requireUser } from '@/lib/auth';
import { canEditClient } from '@/lib/clientAccess';
import { getClientById } from '@/lib/clientsDb';
import { getClientRelatedCounts } from '@/lib/workbookDb';

export const dynamic = 'force-dynamic';

async function RelatedLinksAsync({ clientId, companyName }: { clientId: string; companyName: string }) {
  const related = await getClientRelatedCounts(clientId, companyName);
  return <ClientRelatedLinks clientId={clientId} initial={related} />;
}

export default async function ClientDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const canEdit = canEditClient(user, client);

  return (
    <PortalPageShell className="!py-4">
      <ClientDetailPage
        client={client}
        canEdit={canEdit}
        relatedSlot={
          <Suspense fallback={null}>
            <RelatedLinksAsync clientId={client.id} companyName={client.companyName} />
          </Suspense>
        }
      />
    </PortalPageShell>
  );
}
