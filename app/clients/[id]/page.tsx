import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ContactDetailView from '../../components/ContactDetailView';
import ClientRelatedLinks from '../../components/ClientRelatedLinks';
import ClientDouzoneSection from '../../components/ClientDouzoneSection';
import ClientContactsPanel from '../../components/clients/ClientContactsPanel';
import ClientBlueholePanel from '../../components/clients/ClientBlueholePanel';
import ClientNtsPanel from '../../components/clients/ClientNtsPanel';
import PortalPageShell from '../../components/portal/PortalPageShell';
import { requireUser, isPortalAdmin } from '@/lib/auth';
import { canEditClient } from '@/lib/clientAccess';
import { getClientById } from '@/lib/clientsDb';
import { getClientRelatedCounts } from '@/lib/workbookDb';
import { clientRecordToContact } from '@/lib/clientMapper';

export const dynamic = 'force-dynamic';

/** 연관 메뉴(유입/유출 존재 여부)는 장식용 — 본문 렌더를 막지 않도록 Suspense로 분리 스트리밍 */
async function RelatedLinksAsync({ clientId, companyName }: { clientId: string; companyName: string }) {
  const related = await getClientRelatedCounts(clientId, companyName);
  return <ClientRelatedLinks clientId={clientId} initial={related} />;
}

export default async function ClientDetailPage({
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
          isAdmin={isPortalAdmin(user)}
          ours={{
            companyName: client.companyName,
            businessNo: client.businessNo,
            corporateNo: client.corporateNo,
            representative: client.representative,
            residentNo: client.residentNo,
            fax: client.fax,
            businessEntityType: client.businessEntityType,
          }}
        />
        <ClientNtsPanel
          clientId={client.id}
          businessNumber={client.businessNo}
          representative={client.representative}
          canEdit={canEdit}
          openDatePrefill={String(client.intakeData?.openDate || '')}
          initialNts={client.nts ?? null}
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
        <Suspense fallback={null}>
          <RelatedLinksAsync clientId={client.id} companyName={client.companyName} />
        </Suspense>
      </div>
    </PortalPageShell>
  );
}
