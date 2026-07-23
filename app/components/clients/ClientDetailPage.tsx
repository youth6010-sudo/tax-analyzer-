'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientRecord } from '@/app/types/client';
import type { ContactUpdatePayload } from '@/app/types/contact';
import { clientHasHandledNtsChurn } from '@/app/utils/churnMatch';
import { businessEntityTypeForCategory } from '@/app/utils/clientBizNo';
import { SINGO_DAERI } from '@/app/utils/clientsGrouping';
import {
  getPortalChurnRecords,
  markPortalClientsFresh,
  patchPortalClient,
  subscribePortal,
} from '@/app/utils/portalStore';
import { clientRecordToContact } from '@/lib/clientMapper';
import ContactDetailView from '@/app/components/ContactDetailView';
import ClientRelatedLinks from '@/app/components/ClientRelatedLinks';
import ClientDouzoneSection from '@/app/components/ClientDouzoneSection';
import ClientContactsPanel from '@/app/components/clients/ClientContactsPanel';
import ClientMainMetaSection from '@/app/components/clients/ClientMainMetaSection';
import ClientMaterialsSection from '@/app/components/clients/ClientMaterialsSection';
import ClientBizNoDuplicatesPanel from '@/app/components/clients/ClientBizNoDuplicatesPanel';
import ClientBlueholeCompact from '@/app/components/clients/ClientBlueholeCompact';
import ClientNtsCompact from '@/app/components/clients/ClientNtsCompact';
import { portalBtnPrimary, portalBtnSecondary } from '@/app/components/portal/uiClasses';

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

/** 기업구분·대분류가 서로 어긋나지 않게 한 번에 맞춤 */
function resolveEntityAndCategory(
  baseline: { entity: string; category: string },
  contactForm: ContactUpdatePayload,
  metaCategory: string,
): { entity: ContactUpdatePayload['businessEntityType']; category: string } {
  let entity = contactForm.businessEntityType;
  let category = metaCategory.trim();

  const entityChanged = entity !== baseline.entity;
  const categoryChanged = category !== baseline.category;

  if (entityChanged && !categoryChanged) {
    if (entity === 'corporate') {
      category = '법인';
    } else if (entity === 'individual' || entity === 'nonBusiness') {
      const services = contactForm.serviceTypes ?? [];
      const hasBookkeeping = services.includes('bookkeeping');
      const hasFiling = services.includes('filing');
      category = hasFiling && !hasBookkeeping ? SINGO_DAERI : '개인';
    }
  } else if (categoryChanged && !entityChanged) {
    const synced = businessEntityTypeForCategory(category);
    if (synced) entity = synced;
  } else if (categoryChanged && entityChanged) {
    const synced = businessEntityTypeForCategory(category);
    if (synced) {
      entity = synced;
    } else if (entity === 'corporate') {
      category = '법인';
    } else if (category === '법인') {
      const services = contactForm.serviceTypes ?? [];
      const hasBookkeeping = services.includes('bookkeeping');
      const hasFiling = services.includes('filing');
      category = hasFiling && !hasBookkeeping ? SINGO_DAERI : '개인';
    }
  }

  return { entity, category };
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
  const router = useRouter();
  const [intakeData, setIntakeData] = useState(client.intakeData ?? {});
  const [unifiedEditing, setUnifiedEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [churnRecords, setChurnRecords] = useState(() => getPortalChurnRecords());
  const contactFormRef = useRef<(() => ContactUpdatePayload) | null>(null);
  const metaPatchRef = useRef<(() => { intakeData: Record<string, unknown>; category: string }) | null>(
    null,
  );
  const materialsSaveRef = useRef<(() => Promise<void>) | null>(null);
  const rosterClient = { ...client, intakeData };

  useEffect(() => {
    setIntakeData(client.intakeData ?? {});
  }, [client.id, client.intakeData]);

  useEffect(() => {
    return subscribePortal(() => setChurnRecords(getPortalChurnRecords()));
  }, []);

  const suppressChurnPrompt = useMemo(
    () => clientHasHandledNtsChurn(rosterClient, churnRecords),
    [rosterClient, churnRecords],
  );

  const handleUnifiedSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const contactForm = contactFormRef.current?.();
      if (!contactForm?.companyName?.trim()) {
        setSaveError('업체명은 필수입니다.');
        return;
      }

      const meta = metaPatchRef.current?.() ?? {
        intakeData: {},
        category: String(client.intakeData?.category ?? ''),
      };

      const { entity, category } = resolveEntityAndCategory(
        {
          entity: client.businessEntityType || '',
          category: String(client.intakeData?.category ?? '').trim(),
        },
        contactForm,
        meta.category,
      );

      const intakeDataPatch = {
        ...meta.intakeData,
        category: category || null,
      };

      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contactForm,
          businessEntityType: entity,
          intakeData: intakeDataPatch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? '저장 실패');
      }

      if (data.client) {
        patchPortalClient(client.id, data.client);
        markPortalClientsFresh();
        if (data.client.intakeData) {
          setIntakeData(data.client.intakeData as Record<string, unknown>);
        }
      }

      await materialsSaveRef.current?.();
      setUnifiedEditing(false);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {!canEdit && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          🔒 <b>{client.manager?.trim() || '미지정'}</b> 담당 수임처입니다. 조회만 가능합니다.
        </div>
      )}

      {canEdit && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {saveError && <p className="mr-auto text-xs text-rose-600">{saveError}</p>}
          {!unifiedEditing ? (
            <button
              type="button"
              onClick={() => setUnifiedEditing(true)}
              className={portalBtnPrimary}
            >
              수정
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setUnifiedEditing(false);
                  setSaveError('');
                }}
                disabled={saving}
                className={portalBtnSecondary}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleUnifiedSave()}
                disabled={saving}
                className={portalBtnPrimary}
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </>
          )}
        </div>
      )}

      <article className="rounded-lg border border-slate-200 bg-white">
        <ContactDetailView
          contact={clientRecordToContact(client)}
          primaryContactName={client.primaryContactName}
          canEdit={canEdit}
          variant="flat"
          forcedEditing={unifiedEditing}
          hideEditButton
          getFormRef={contactFormRef}
          titleAside={<ClientContactsPanel clientId={client.id} canEdit={canEdit && unifiedEditing} inline />}
        />

        <div className="border-t border-slate-200 px-4 pb-4">
          <Section title="등록 · 중복 확인" accent="amber">
            <ClientBizNoDuplicatesPanel client={rosterClient} canEdit={canEdit} />
          </Section>

          <Section title="사업장 · 신고대상" accent="violet">
            <ClientMainMetaSection
              clientId={client.id}
              intakeData={intakeData}
              canEdit={canEdit}
              forcedEditing={unifiedEditing}
              hideEditControls
              getPatchRef={metaPatchRef}
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
                suppressChurnPrompt={suppressChurnPrompt}
              />
            </div>
          </Section>

          <Section title="필요자료 · 특이사항" accent="blue">
            <ClientMaterialsSection
              client={rosterClient}
              canEdit={canEdit && unifiedEditing}
              hideSaveButton
              onSaveRef={materialsSaveRef}
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
                canEdit={canEdit && unifiedEditing}
                embedded
              />
            </Section>
          )}

          {relatedSlot && (
            <Section title="연관 업무" className="border-b-0">
              {relatedSlot}
            </Section>
          )}
        </div>
      </article>

      <ClientRelatedLinks clientId={client.id} />
    </div>
  );
}
