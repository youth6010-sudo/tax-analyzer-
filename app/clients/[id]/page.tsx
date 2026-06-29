import { notFound } from 'next/navigation';
import ContactDetailView from '../../components/ContactDetailView';
import ClientRelatedLinks from '../../components/ClientRelatedLinks';
import ClientDouzoneSection from '../../components/ClientDouzoneSection';
import ClientContactsPanel from '../../components/clients/ClientContactsPanel';
import ClientBlueholePanel from '../../components/clients/ClientBlueholePanel';
import PortalPageShell from '../../components/portal/PortalPageShell';
import { requireUser } from '@/lib/auth';
import { canEditClient } from '@/lib/clientAccess';
import { getClientById } from '@/lib/clientsDb';
import { getClientRelatedCounts } from '@/lib/workbookDb';
import { clientRecordToContact } from '@/lib/clientMapper';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const related = await getClientRelatedCounts(id, client.companyName);
  const canEdit = canEditClient(user, client);

  return (
    <PortalPageShell narrow>
      {!canEdit && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          🔒 <b>{client.manager?.trim() || '미지정'}</b> 담당 수임처입니다. 조회만 가능하며, 정보 수정은 담당자 또는 찰리만 할 수 있어요.
        </div>
      )}
      <ContactDetailView
        contact={clientRecordToContact(client)}
        primaryContactName={client.primaryContactName}
        canEdit={canEdit}
      />
      <div className="space-y-4 -mt-2">
        <ClientContactsPanel clientId={client.id} canEdit={canEdit} />
        <ClientBlueholePanel
          clientId={client.id}
          companyName={client.companyName}
          businessNumber={client.businessNo}
          canEdit={canEdit}
        />
        {client.source === 'douzone_export' && (
          <ClientDouzoneSection
            clientId={client.id}
            intakeData={client.intakeData}
            feeSummary={client.feeSummary}
            program={client.program}
            canEdit={canEdit}
          />
        )}
        <ClientRelatedLinks clientId={client.id} initial={related} />
      </div>
    </PortalPageShell>
  );
}
