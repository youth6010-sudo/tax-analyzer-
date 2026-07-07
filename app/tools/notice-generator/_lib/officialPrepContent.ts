/** 준비서류(부가세·법인세·종소세) 본문 — 공문양식에 삽입 */

import type { OfficialLetterKind } from './officialLetter';
import { DEFAULT_OFFICIAL_VAT_BODY } from './defaultOfficialVatBody';
import { DEFAULT_OFFICIAL_INCOME_BODY } from './defaultOfficialIncomeBody';

import { buildCorporatePrepContent } from './corporateFormalItems';

export function extractPrepContentSections(fullBody: string): string {
  const start = fullBody.indexOf('<div class="content-grid">');
  const end = fullBody.indexOf('<footer>');
  if (start === -1) return '';
  return fullBody.slice(start, end === -1 ? undefined : end).trim();
}

const CORPORATE_PREP_BODY = buildCorporatePrepContent();

export const PREP_CONTENT_BY_KIND: Record<OfficialLetterKind, string> = {
  vat: extractPrepContentSections(DEFAULT_OFFICIAL_VAT_BODY),
  income: extractPrepContentSections(DEFAULT_OFFICIAL_INCOME_BODY),
  corporate: CORPORATE_PREP_BODY.trim(),
};

export function prepContentForKind(kind: OfficialLetterKind): string {
  return PREP_CONTENT_BY_KIND[kind];
}
