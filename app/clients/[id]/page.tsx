import { notFound } from 'next/navigation';
import AppHeader from '../../components/AppHeader';
import ContactDetailView from '../../components/ContactDetailView';
import ClientRelatedLinks from '../../components/ClientRelatedLinks';
import ClientDouzoneSection from '../../components/ClientDouzoneSection';
import ClientDetailExtras from '../../components/clients/ClientDetailExtras';
import { requireUser } from '@/lib/auth';
import { getClientById } from '@/lib/clientsDb';
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <ContactDetailView contact={clientRecordToContact(client)} />
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 pb-8 space-y-4 -mt-2">
        <ClientDetailExtras client={client} />
        {client.source === 'douzone_export' && (
          <ClientDouzoneSection
            clientId={client.id}
            intakeData={client.intakeData}
            feeSummary={client.feeSummary}
            program={client.program}
          />
        )}
        <ClientRelatedLinks clientId={client.id} />
      </div>
    </div>
  );
}
