'use client';

import { useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import { clientRecordToContact } from '@/lib/clientMapper';
import ContactDetailView from '@/app/components/ContactDetailView';
import ClientRelatedLinks from '@/app/components/ClientRelatedLinks';
import ClientDouzoneSection from '@/app/components/ClientDouzoneSection';
import ClientContactsPanel from '@/app/components/clients/ClientContactsPanel';
import ClientMainMetaSection from '@/app/components/clients/ClientMainMetaSection';
import ClientMaterialsSection from '@/app/components/clients/ClientMaterialsSection';
import ClientBlueholeCompact from '@/app/components/clients/ClientBlueholeCompact';
import ClientNtsCompact from '@/app/components/clients/ClientNtsCompact';

function Section({
  title,
  children,
  className = '',
  accent = 'slate',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  accent?: 'slate' | 'violet' | 'emerald' | 'blue' | 'amber';
}) {
  const accentBar: Record<string, string> = {
    slate: 'bg-slate-400',
    violet: 'bg-violet-400',
    emerald: 'bg-emerald-400',
    blue: 'bg-blue-400',
    amber: 'bg-amber-400',
  };
  return (
    <section className={`border-b border-slate-200 py-3 last:border-b-0 ${className}`}>
      <h2 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
        <span className={`h-3.5 w-1 rounded-full ${accentBar[accent]}`} />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ClientDetailPage({
  client,
  canEdit,
  relatedSlot,
}: {
  client: ClientRecord;
  canEdit: boolean;
  relatedSlot?: React.ReactNode;
}) {
  const [intakeData, setIntakeData] = useState(client.intakeData ?? {});
  const rosterClient = { ...client, intakeData };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {!canEdit && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          🔒 <b>{client.manager?.trim() || '미지정'}</b> 담당 수임처입니다. 조회만 가능합니다.
        </div>
      )}

      <article className="rounded-lg border border-slate-200 bg-white">
        <ContactDetailView
          contact={clientRecordToContact(client)}
          primaryContactName={client.primaryContactName}
          canEdit={canEdit}
          variant="flat"
          titleAside={<ClientContactsPanel clientId={client.id} canEdit={canEdit} inline />}
        />

        <div className="border-t border-slate-200 px-4 pb-4">
          <Section title="사업장 · 신고대상" accent="violet">
            <ClientMainMetaSection
              clientId={client.id}
              intakeData={intakeData}
              canEdit={canEdit}
              onSaved={setIntakeData}
              embedded
            />
          </Section>

          <Section title="연동 현황" accent="emerald">
            <div className="grid gap-2 sm:grid-cols-2">
              <ClientBlueholeCompact clientId={client.id} companyName={client.companyName} />
              <ClientNtsCompact
                clientId={client.id}
                businessNumber={client.businessNo}
                initialNts={client.nts ?? null}
              />
            </div>
          </Section>

          <Section title="필요자료 · 특이사항" accent="blue">
            <ClientMaterialsSection
              client={rosterClient}
              canEdit={canEdit}
              embedded
              onSaved={setIntakeData}
            />
          </Section>


          {client.source === 'douzone_export' && (
            <Section title="기타 상세정보">
              <ClientDouzoneSection
                clientId={client.id}
                intakeData={intakeData}
                feeSummary={client.feeSummary}
                program={client.program}
                canEdit={canEdit}
                embedded
              />
            </Section>
          )}

          {relatedSlot && (
            <Section title="연관 메뉴" className="border-b-0">
              {relatedSlot}
            </Section>
          )}
        </div>
      </article>
    </div>
  );
}
