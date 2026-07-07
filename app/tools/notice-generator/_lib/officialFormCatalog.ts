/** 세목별 공문양식 — 통일 레이아웃 + 세목별 본문 */

import { TAX_TYPES } from './taxTypes';
import type { OfficialLetterKind } from './officialLetter';
import type { DeadlineParams } from './types';
import { buildFormalDocument } from './officialFormalShell';
import { prepContentForKind } from './officialPrepContent';

export type OfficialFormType = {
  id: string;
  label: string;
  taxKind: OfficialLetterKind;
  vatPeriodId?: string;
  fyEndMonth?: number;
  filingTypeId?: string;
};

function formalBodyToken(kind: OfficialLetterKind): string {
  if (kind === 'vat') return '{부가세공문본문}';
  if (kind === 'corporate') return '{법인세공문본문}';
  return prepContentForKind('income');
}

export function resolveOfficialFormId(
  kind: OfficialLetterKind,
  params: DeadlineParams,
): string {
  if (kind === 'vat') return `formal-vat-${params.vatPeriodId}`;
  if (kind === 'corporate') return `formal-corp-${params.fyEndMonth}`;
  return `formal-income-${params.filingTypeId}`;
}

export function defaultOfficialFormBodyForKind(kind: OfficialLetterKind): string {
  return buildFormalDocument(formalBodyToken(kind));
}

export function taxKindFromFormId(formId: string): OfficialLetterKind {
  if (formId.startsWith('formal-corp-')) return 'corporate';
  if (formId.startsWith('formal-income-')) return 'income';
  return 'vat';
}

export function taxTypeFromOfficialKind(kind: OfficialLetterKind) {
  if (kind === 'vat') return TAX_TYPES.VAT;
  if (kind === 'corporate') return TAX_TYPES.CORPORATE;
  return TAX_TYPES.INCOME;
}

/** @deprecated resolveOfficialFormId + kind 사용 */
export function defaultOfficialFormBody(formId: string): string {
  return defaultOfficialFormBodyForKind(taxKindFromFormId(formId));
}

/** @deprecated */
export function getOfficialFormType(_id: string): undefined {
  return undefined;
}

/** @deprecated */
export const OFFICIAL_FORM_TYPES: OfficialFormType[] = [];
export const OFFICIAL_FORM_CATALOG: { id: string; label: string; forms: OfficialFormType[] }[] =
  [];

export function taxTypeFromFormId(formId: string) {
  return taxTypeFromOfficialKind(taxKindFromFormId(formId));
}
