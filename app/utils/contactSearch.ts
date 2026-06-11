import type { ContactRecord, ContactSearchField } from '../types/contact';
import type { TaxTypeId } from '../config/taxTypes';

const SEARCH_FIELDS: ContactSearchField[] = [
  'companyName',
  'representative',
  'businessNo',
  'corporateNo',
  'residentNo',
  'phone',
  'manager',
];

function normalize(value: string): string {
  return value.replace(/[\s\-./]/g, '').toLowerCase();
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function matchesField(record: ContactRecord, field: ContactSearchField, query: string): boolean {
  const raw = record[field];
  if (!raw) return false;

  const q = query.trim();
  if (!q) return false;

  const qNorm = normalize(q);
  const qDigits = digits(q);

  if (field === 'businessNo' || field === 'corporateNo' || field === 'residentNo' || field === 'phone') {
    const rawDigits = digits(raw);
    if (qDigits.length >= 2 && rawDigits.includes(qDigits)) return true;
  }

  return normalize(raw).includes(qNorm) || raw.includes(q);
}

export function filterContactsByTaxType(
  contacts: ContactRecord[],
  taxType: TaxTypeId,
): ContactRecord[] {
  return contacts.filter(c => c.taxTypes.includes(taxType));
}

export function searchContacts(
  contacts: ContactRecord[],
  query: string,
): { record: ContactRecord; matchedFields: ContactSearchField[] }[] {
  const q = query.trim();
  if (!q) return [];

  return contacts
    .map(record => {
      const matchedFields = SEARCH_FIELDS.filter(field => matchesField(record, field, q));
      return { record, matchedFields };
    })
    .filter(({ matchedFields }) => matchedFields.length > 0);
}
