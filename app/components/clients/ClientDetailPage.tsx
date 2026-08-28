'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientRecord } from '@/app/types/client';
import type { ContactUpdatePayload } from '@/app/types/contact';
import { clientNeedsNtsAttention } from '@/app/utils/churnMatch';
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
import ClientNtsPanel from '@/app/components/clients/ClientNtsPanel';
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
  const services = contactForm.serviceTypes ?? [];
  const hasBookkeeping = services.includes('bookkeeping');
  const hasFiling = services.includes('filing');
  const filingOnly = hasFiling && !hasBookkeeping;

  if (entityChanged && !categoryChanged) {
    if (filingOnly) {
      category = SINGO_DAERI;
    } else if (entity === 'corporate') {
      category = '법인';
    } else if (entity === 'individual' || entity === 'nonBusiness') {
      category = '개인';
    } else if (!entity) {
      // 구분 재클릭 해제 → 대분류도 비움 (신고대리 수동값 제외는 sync가 처리)
      if (category === '개인' || category === '법인' || category === SINGO_DAERI) {
        category = '';
      }
    }
  } else if (categoryChanged && !entityChanged) {
    // 신고대리는 entity를 지우지 않음 (법인·개인 유지 가능)
    if (category !== SINGO_DAERI) {
      const synced = businessEntityTypeForCategory(category);
      if (synced) entity = synced;
      if (!category && (baseline.category === '개인' || baseline.category === '법인' || baseline.category === SINGO_DAERI)) {
        // 대분류 해제 시 구분도 비울 수 있게 둠 — entity는 유지(사용자가 구분에서 해제)
      }
    }
  } else if (categoryChanged && entityChanged) {
    if (filingOnly) {
      category = SINGO_DAERI;
    } else if (category === SINGO_DAERI) {
      // entity는 사용자 선택 유지
    } else {
      const synced = businessEntityTypeForCategory(category);
      if (synced) {
        entity = synced;
      } else if (entity === 'corporate') {
        category = '법인';
      } else if (entity === 'individual' || entity === 'nonBusiness') {
        category = '개인';
      } else if (!entity) {
        category = '';
      }
    }
  } else if (filingOnly) {
    category = SINGO_DAERI;
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
  const clientAddress = typeof intakeData.address === 'string' ? intakeData.address.trim() : '';

  useEffect(() => {
    setIntakeData(client.intakeData ?? {});
  }, [client.id, client.intakeData]);

  useEffect(() => {
    return subscribePortal(() => setChurnRecords(getPortalChurnRecords()));
  }, []);

  const suppressChurnPrompt = useMemo(
    () => !clientNeedsNtsAttention(rosterClient, churnRecords),
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

          <Section title="4대보험 관할" accent="blue">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  수임처 주소로 국민건강보험공단·국민연금공단·근로복지공단 지사를 검색합니다.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {clientAddress || '주소가 없으면 검색 페이지에서 직접 입력할 수 있습니다.'}
                </p>
              </div>
              <a
                href={`/tools/nhis-branches?returnTo=${encodeURIComponent(`/clients/${client.id}`)}&returnLabel=${encodeURIComponent(client.companyName || '수임처')}${clientAddress ? `&query=${encodeURIComponent(clientAddress)}` : ''}${client.businessNo ? `&businessNo=${encodeURIComponent(client.businessNo)}` : ''}${client.companyName ? `&companyName=${encodeURIComponent(client.companyName)}` : ''}`}
                className={portalBtnSecondary}
              >
                수임처 주소로 검색하기
              </a>
            </div>
          </Section>

          <Section title="연동 현황" accent="emerald">
            <ClientBlueholeCompact clientId={client.id} companyName={client.companyName} />
          </Section>

          <Section title="국세청" accent="amber">
            <ClientNtsPanel
              clientId={client.id}
              businessNumber={client.businessNo}
              representative={client.representative}
              canEdit={canEdit}
              openDatePrefill={String(intakeData.openDate ?? '')}
              clientTaxKind={String(intakeData.taxKind ?? '')}
              initialNts={client.nts ?? null}
              suppressChurnPrompt={suppressChurnPrompt}
            />
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
