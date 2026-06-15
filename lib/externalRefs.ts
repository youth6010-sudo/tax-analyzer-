import { buildBlueholeCaseUrl } from '@/app/config/bluehole';
import type { ExternalRefEntry, ExternalRefs } from '@/app/types/externalRefs';

export function parseExternalRefs(intakeData: Record<string, unknown> | null | undefined): ExternalRefs {
  const raw = intakeData?.externalRefs;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ExternalRefs;
}

export function mergeExternalRefs(
  existing: ExternalRefs,
  patch: Partial<ExternalRefs>,
): ExternalRefs {
  const next: ExternalRefs = { ...existing };
  for (const key of ['bluehole', 'tp', 'semorang', 'wemembers'] as const) {
    if (patch[key] !== undefined) {
      next[key] = { ...existing[key], ...patch[key] };
    }
  }
  return next;
}

export function blueholeRefFromCase(raw: string, registeredBy?: string): ExternalRefEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const url = buildBlueholeCaseUrl(trimmed);
  const id = trimmed.replace(/^#\s*/, '').match(/\d+/)?.[0] ?? trimmed;
  return {
    id,
    url: url ?? undefined,
    registeredAt: new Date().toISOString(),
    registeredBy,
  };
}

export function externalRefsFromInquiryExtra(
  extra: Record<string, unknown> | undefined,
  registeredBy?: string,
): ExternalRefs {
  const refs: ExternalRefs = {};
  const caseRaw = typeof extra?.blueholeCase === 'string' ? extra.blueholeCase : '';
  const bh = blueholeRefFromCase(caseRaw, registeredBy);
  if (bh) refs.bluehole = bh;

  const rawExt = extra?.externalRefs;
  if (rawExt && typeof rawExt === 'object' && !Array.isArray(rawExt)) {
    return mergeExternalRefs(rawExt as ExternalRefs, refs);
  }
  return refs;
}

export function intakeDataWithExternalRefs(
  intakeData: Record<string, unknown>,
  refs: ExternalRefs,
): Record<string, unknown> {
  return {
    ...intakeData,
    externalRefs: mergeExternalRefs(parseExternalRefs(intakeData), refs),
  };
}

export function hasBlueholeRef(intakeData: Record<string, unknown> | undefined): boolean {
  return Boolean(parseExternalRefs(intakeData).bluehole?.id);
}
