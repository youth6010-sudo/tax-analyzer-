import { notFound } from 'next/navigation';
import ContactDetailView from '../../components/ContactDetailView';
import ClientRelatedLinks from '../../components/ClientRelatedLinks';
import ClientDouzoneSection from '../../components/ClientDouzoneSection';
import ClientContactsPanel from '../../components/clients/ClientContactsPanel';
import PortalPageShell from '../../components/portal/PortalPageShell';
import { requireUser } from '@/lib/auth';
import { getClientById } from '@/lib/clientsDb';
import { getClientRelatedCounts } from '@/lib/workbookDb';
import { clientRecordToContact } from '@/lib/clientMapper';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const related = await getClientRelatedCounts(id, client.companyName);

  return (
    <PortalPageShell narrow>
      <ContactDetailView
        contact={clientRecordToContact(client)}
        primaryContactName={client.primaryContactName}
      />
      <div className="space-y-4 -mt-2">
        <ClientContactsPanel clientId={client.id} />
        {client.source === 'douzone_export' && (
          <ClientDouzoneSection
            clientId={client.id}
            intakeData={client.intakeData}
            feeSummary={client.feeSummary}
            program={client.program}
          />
        )}
        <ClientRelatedLinks clientId={client.id} initial={related} />
      </div>
    </PortalPageShell>
  );
}
