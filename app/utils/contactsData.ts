import fs from 'fs';
import path from 'path';
import type {
  BusinessEntityType,
  ContactDatabase,
  ContactRecord,
  ContactUpdatePayload,
  ServiceType,
} from '../types/contact';
import { BUSINESS_ENTITY_TYPES, SERVICE_TYPES } from '../types/contact';
import { TAX_TYPES } from '../config/taxTypes';
import type { TaxTypeId } from '../config/taxTypes';

const DATA_PATH = path.join(process.cwd(), 'public', 'data', 'contacts.json');

const VALID_TAX_IDS = new Set<TaxTypeId>(TAX_TYPES.map(t => t.id));
const VALID_BUSINESS_ENTITY = new Set<BusinessEntityType>(
  BUSINESS_ENTITY_TYPES.map(t => t.id),
);
const VALID_SERVICE_TYPES = new Set<ServiceType>(SERVICE_TYPES.map(t => t.id));

function readDatabase(): ContactDatabase {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw) as ContactDatabase;
}

function writeDatabase(db: ContactDatabase): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function normalizeContact(raw: Partial<ContactRecord> & { id: string; shortcutNo?: unknown }): ContactRecord {
  const businessEntityType =
    raw.businessEntityType && VALID_BUSINESS_ENTITY.has(raw.businessEntityType as BusinessEntityType)
      ? (raw.businessEntityType as BusinessEntityType)
      : '';

  return {
    id: raw.id,
    taxTypes: (raw.taxTypes ?? []).filter(t => VALID_TAX_IDS.has(t)),
    businessEntityType,
    serviceTypes: (raw.serviceTypes ?? []).filter(t => VALID_SERVICE_TYPES.has(t as ServiceType)) as ServiceType[],
    manager: raw.manager ?? '',
    companyName: raw.companyName ?? '',
    representative: raw.representative ?? '',
    businessNo: raw.businessNo ?? '',
    corporateNo: raw.corporateNo ?? '',
    residentNo: raw.residentNo ?? '',
    phone: raw.phone ?? '',
    fax: raw.fax ?? '',
  };
}

export function getAllContacts(): ContactRecord[] {
  return readDatabase().contacts.map(normalizeContact);
}

export function getContactById(id: string): ContactRecord | undefined {
  const found = readDatabase().contacts.find(c => c.id === id);
  return found ? normalizeContact(found) : undefined;
}

export function updateContact(id: string, payload: ContactUpdatePayload): ContactRecord {
  const db = readDatabase();
  const idx = db.contacts.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('NOT_FOUND');

  if (!payload.companyName.trim()) throw new Error('COMPANY_NAME_REQUIRED');

  const businessEntityType =
    payload.businessEntityType && VALID_BUSINESS_ENTITY.has(payload.businessEntityType)
      ? payload.businessEntityType
      : '';

  const updated: ContactRecord = {
    id,
    companyName: payload.companyName.trim(),
    manager: payload.manager.trim(),
    representative: payload.representative.trim(),
    businessNo: payload.businessNo.trim(),
    corporateNo: payload.corporateNo.trim(),
    residentNo: payload.residentNo.trim(),
    phone: payload.phone.trim(),
    fax: payload.fax.trim(),
    taxTypes: payload.taxTypes.filter(t => VALID_TAX_IDS.has(t)),
    businessEntityType,
    serviceTypes: payload.serviceTypes.filter(t => VALID_SERVICE_TYPES.has(t)),
  };

  db.contacts[idx] = updated;
  db.updatedAt = new Date().toISOString();
  writeDatabase(db);
  return updated;
}
