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
  for (const key of ['tp', 'semorang', 'wemembers'] as const) {
    if (patch[key] !== undefined) {
      next[key] = { ...existing[key], ...patch[key] };
    }
  }
  return next;
}

/** 유입 extra에 명시된 externalRefs만 반영 */
export function externalRefsFromInquiryExtra(
  extra: Record<string, unknown> | undefined,
  _registeredBy?: string,
): ExternalRefs {
  const rawExt = extra?.externalRefs;
  if (rawExt && typeof rawExt === 'object' && !Array.isArray(rawExt)) {
    return rawExt as ExternalRefs;
  }
  return {};
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
