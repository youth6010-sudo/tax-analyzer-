import type { personalChecklistItems } from '@/db/schema';
import type { ClientRecord } from '@/app/types/client';
import { readMaterialsBundle } from '@/lib/clientMaterials';
import { updateClientDetail } from '@/lib/clientsDb';
import { isCorporateClient } from '@/app/utils/filingCheck';
import { readNoticeMap } from '@/app/tools/notice-generator/_lib/clientNotice';
import type { ClientNoticeMap } from '@/app/tools/notice-generator/_lib/clientNotice';
import { TAX_TO_DOUZONE_NOTE_KEY } from '@/app/tools/notice-generator/_lib/clientNotice';
import type { TaxTypeKey } from '@/app/tools/notice-generator/_lib/types';

const MARKER_PREFIX = '[체크리스트:';

export function checklistNoteMarker(itemId: string): string {
  return `${MARKER_PREFIX}${itemId}]`;
}

function checklistLine(itemId: string, title: string): string {
  return `${checklistNoteMarker(itemId)} ${title.trim()}`;
}

function stripMarkerLines(text: string, itemId: string): string {
  const marker = checklistNoteMarker(itemId);
  return text
    .split('\n')
    .filter(line => !line.includes(marker))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function appendLine(text: string, line: string): string {
  const base = text.trim();
  if (!base) return line;
  if (base.includes(line)) return base;
  return `${base}\n${line}`;
}

function taxTypeToNoticeKey(taxType: string): TaxTypeKey | null {
  switch (taxType) {
    case 'withholding': return 'withholding';
    case 'vat': return 'vat';
    case 'comprehensive': return 'income';
    case 'corporate': return 'corporate';
    default: return null;
  }
}

function bundleFieldForItem(
  item: typeof personalChecklistItems.$inferSelect,
  isCorporate: boolean,
): keyof ReturnType<typeof readMaterialsBundle> | null {
  if (item.category === 'other') return 'otherMaterials';
  const key = taxTypeToNoticeKey(item.taxType);
  if (!key) return 'otherMaterials';
  if (key === 'withholding') return 'withholdingNotes';
  if (key === 'vat') return 'vatNotes';
  if (key === 'corporate') return isCorporate ? 'corporateNotes' : null;
  if (key === 'income') return isCorporate ? null : 'incomeNotes';
  return null;
}

async function saveBundleToClient(
  client: ClientRecord,
  bundle: ReturnType<typeof readMaterialsBundle>,
): Promise<void> {
  const intake = (client.intakeData ?? {}) as Record<string, unknown>;
  const currentMap = readNoticeMap(intake);
  const notes = (intake.notes && typeof intake.notes === 'object' && !Array.isArray(intake.notes))
    ? { ...(intake.notes as Record<string, string>) }
    : {};

  const isCorporate = isCorporateClient(client);
  const nextMap: ClientNoticeMap = {
    ...currentMap,
    withholding: {
      materials: bundle.withholdingMaterials,
      notes: bundle.withholdingNotes,
      payrollByUs: currentMap.withholding?.payrollByUs ?? false,
    },
    vat: {
      materials: bundle.vatMaterials,
      notes: bundle.vatNotes,
    },
  };

  if (isCorporate) {
    nextMap.corporate = {
      materials: bundle.corporateMaterials,
      notes: bundle.corporateNotes,
    };
  } else {
    nextMap.income = {
      materials: bundle.incomeMaterials,
      notes: bundle.incomeNotes,
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

  await updateClientDetail(client.id, {
    intakeData: { ...intake, noticeData: nextMap, notes: nextNotes },
  });
}

export async function syncChecklistToClientNotes(
  client: ClientRecord,
  item: typeof personalChecklistItems.$inferSelect,
): Promise<void> {
  if (!item.reflectInNotes || !item.clientId) return;

  const isCorporate = isCorporateClient(client);
  const bundle = readMaterialsBundle(client);
  const field = bundleFieldForItem(item, isCorporate);
  if (!field) return;

  const line = checklistLine(item.id, item.title);
  const current = bundle[field] as string;
  const next = appendLine(stripMarkerLines(current, item.id), line);
  await saveBundleToClient(client, { ...bundle, [field]: next });
}

export async function unsyncChecklistFromClientNotes(
  client: ClientRecord,
  item: typeof personalChecklistItems.$inferSelect,
): Promise<void> {
  if (!item.clientId) return;

  const isCorporate = isCorporateClient(client);
  const bundle = readMaterialsBundle(client);
  const field = bundleFieldForItem(item, isCorporate);
  if (!field) return;

  const current = bundle[field] as string;
  const next = stripMarkerLines(current, item.id);
  if (next === current.trim()) return;
  await saveBundleToClient(client, { ...bundle, [field]: next });
}
