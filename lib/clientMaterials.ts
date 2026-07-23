import type { ClientRecord } from '@/app/types/client';
import { isCorporateClient } from '@/app/utils/filingCheck';
import {
  DEFAULT_MATERIALS_BY_TAX,
  NOTES_EXAMPLE_BY_TAX,
  readNoticeMap,
  TAX_TO_DOUZONE_NOTE_KEY,
  type ClientNoticeMap,
  type NoticeClientData,
} from '@/app/tools/notice-generator/_lib/clientNotice';
import type { TaxTypeKey } from '@/app/tools/notice-generator/_lib/types';

export type MaterialsBundle = {
  withholdingMaterials: string;
  withholdingNotes: string;
  vatMaterials: string;
  vatNotes: string;
  incomeMaterials: string;
  incomeNotes: string;
  corporateMaterials: string;
  corporateNotes: string;
  otherMaterials: string;
};

function noteMap(intakeData: Record<string, unknown>): Record<string, string> {
  const raw = intakeData.notes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, string>) };
}

export function readMaterialsBundle(client: Pick<ClientRecord, 'intakeData' | 'businessEntityType'>): MaterialsBundle {
  const intake = (client.intakeData ?? {}) as Record<string, unknown>;
  const map = readNoticeMap(intake);
  const notes = noteMap(intake);

  return {
    withholdingMaterials: map.withholding?.materials?.trim() || notes.withholding?.trim() || '',
    withholdingNotes: map.withholding?.notes?.trim() || '',
    vatMaterials: map.vat?.materials?.trim() || notes.vat?.trim() || '',
    vatNotes: map.vat?.notes?.trim() || '',
    incomeMaterials: map.income?.materials?.trim() || notes.comprehensive?.trim() || '',
    incomeNotes: map.income?.notes?.trim() || '',
    corporateMaterials: map.corporate?.materials?.trim() || notes.corporate?.trim() || '',
    corporateNotes: map.corporate?.notes?.trim() || '',
    otherMaterials: notes.other?.trim() || '',
  };
}

export function materialsPlaceholders(isCorporate: boolean) {
  return {
    withholding: DEFAULT_MATERIALS_BY_TAX.withholding,
    vat: DEFAULT_MATERIALS_BY_TAX.vat,
    income: DEFAULT_MATERIALS_BY_TAX.income,
    corporate: DEFAULT_MATERIALS_BY_TAX.corporate,
    withholdingNotes: NOTES_EXAMPLE_BY_TAX.withholding,
    vatNotes: NOTES_EXAMPLE_BY_TAX.vat,
    incomeNotes: NOTES_EXAMPLE_BY_TAX.income,
    corporateNotes: NOTES_EXAMPLE_BY_TAX.corporate,
    other: '예) 공통 특이사항, 기타 안내',
  };
}

export async function saveMaterialsBundle(
  clientId: string,
  intakeData: Record<string, unknown>,
  bundle: MaterialsBundle,
  isCorporate: boolean,
): Promise<Record<string, unknown>> {
  const currentMap = readNoticeMap(intakeData);
  const notes = noteMap(intakeData);

  const nextMap: ClientNoticeMap = {
    ...currentMap,
    withholding: {
      materials: bundle.withholdingMaterials,
      notes: bundle.withholdingNotes,
      payrollByUs: currentMap.withholding?.payrollByUs ?? false,
      attachNote: currentMap.withholding?.attachNote,
    },
    vat: {
      materials: bundle.vatMaterials,
      notes: bundle.vatNotes,
      attachNote: currentMap.vat?.attachNote,
    },
  };

  if (isCorporate) {
    nextMap.corporate = {
      materials: bundle.corporateMaterials,
      notes: bundle.corporateNotes,
      attachNote: currentMap.corporate?.attachNote,
    };
  } else {
    nextMap.income = {
      materials: bundle.incomeMaterials,
      notes: bundle.incomeNotes,
      attachNote: currentMap.income?.attachNote,
    };
  }

  const nextNotes = { ...notes };
  (Object.entries(TAX_TO_DOUZONE_NOTE_KEY) as [TaxTypeKey, string][]).forEach(([tax, key]) => {
    const entry = nextMap[tax];
    if (entry?.materials?.trim()) nextNotes[key] = entry.materials;
    else delete nextNotes[key];
  });
  if (bundle.otherMaterials.trim()) nextNotes.other = bundle.otherMaterials;
  else delete nextNotes.other;

  const res = await fetch(`/api/clients/${clientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      intakeData: { noticeData: nextMap, notes: nextNotes },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? '저장하지 못했습니다.');
  }
  const body = (await res.json().catch(() => ({}))) as { client?: { intakeData?: Record<string, unknown> } };
  return body.client?.intakeData ?? { ...intakeData, noticeData: nextMap, notes: nextNotes };
}

export function isClientCorporateForMaterials(client: Pick<ClientRecord, 'businessEntityType' | 'intakeData'>): boolean {
  return isCorporateClient(client as ClientRecord);
}
