import { NextResponse } from 'next/server';
import { getContactById, updateContact } from '../../../utils/contactsData';
import type { BusinessEntityType, ContactUpdatePayload, ServiceType } from '../../../types/contact';
import { BUSINESS_ENTITY_TYPES, SERVICE_TYPES } from '../../../types/contact';
import { TAX_TYPES } from '../../../config/taxTypes';
import type { TaxTypeId } from '../../../config/taxTypes';

const VALID_TAX_IDS = new Set<TaxTypeId>(TAX_TYPES.map(t => t.id));
const VALID_BUSINESS_ENTITY = new Set<BusinessEntityType>(
  BUSINESS_ENTITY_TYPES.map(t => t.id),
);
const VALID_SERVICE_TYPES = new Set<ServiceType>(SERVICE_TYPES.map(t => t.id));

function parsePayload(body: unknown): ContactUpdatePayload {
  if (!body || typeof body !== 'object') throw new Error('INVALID_BODY');
  const b = body as Record<string, unknown>;

  const taxTypes = Array.isArray(b.taxTypes)
    ? b.taxTypes.filter((t): t is TaxTypeId => typeof t === 'string' && VALID_TAX_IDS.has(t as TaxTypeId))
    : [];

  const serviceTypes = Array.isArray(b.serviceTypes)
    ? b.serviceTypes.filter(
        (t): t is ServiceType => typeof t === 'string' && VALID_SERVICE_TYPES.has(t as ServiceType),
      )
    : [];

  const businessEntityType =
    typeof b.businessEntityType === 'string' &&
    VALID_BUSINESS_ENTITY.has(b.businessEntityType as BusinessEntityType)
      ? (b.businessEntityType as BusinessEntityType)
      : '';

  return {
    companyName: typeof b.companyName === 'string' ? b.companyName : '',
    manager: typeof b.manager === 'string' ? b.manager : '',
    representative: typeof b.representative === 'string' ? b.representative : '',
    businessNo: typeof b.businessNo === 'string' ? b.businessNo : '',
    corporateNo: typeof b.corporateNo === 'string' ? b.corporateNo : '',
    residentNo: typeof b.residentNo === 'string' ? b.residentNo : '',
    phone: typeof b.phone === 'string' ? b.phone : '',
    mobilePhone: typeof b.mobilePhone === 'string' ? b.mobilePhone : '',
    fax: typeof b.fax === 'string' ? b.fax : '',
    taxTypes,
    businessEntityType,
    serviceTypes,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contact = getContactById(id);
  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const payload = parsePayload(body);
    const updated = updateContact(id, payload);
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN';
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (msg === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '업체명은 필수입니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
  }
}
