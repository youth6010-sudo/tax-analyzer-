import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient, assertCanEditClient, assertClientExists } from '@/lib/clientAccess';
import { getClientById, updateClient } from '@/lib/clientsDb';
import { clientRecordToContact } from '@/lib/clientMapper';
import type { BusinessEntityType, ContactUpdatePayload, ServiceType } from '../../../types/contact';
import { BUSINESS_ENTITY_TYPES, SERVICE_TYPES } from '../../../types/contact';
import { TAX_TYPES } from '../../../config/taxTypes';
import type { TaxTypeId } from '../../../config/taxTypes';

/** 레거시 연락처 API — public/data 파일이 아니라 수임처 DB를 읽기/수정한다. */

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
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client);
    assertCanAccessClient(user, client);
    return NextResponse.json(clientRecordToContact(client), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getClientById(id);
    assertCanEditClient(user, existing);
    const body = await req.json();
    const payload = parsePayload(body);
    const updated = await updateClient(id, payload, {
      loginId: user.loginId,
      name: user.name,
    });
    return NextResponse.json(clientRecordToContact(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN';
    if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN' || msg === 'NOT_FOUND') {
      return handleApiError(e);
    }
    if (msg === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '업체명은 필수입니다.' }, { status: 400 });
    }
    if (msg === 'MANAGER_LOCKED') {
      return NextResponse.json({ error: '담당자는 변경할 수 없습니다.' }, { status: 403 });
    }
    if (msg === 'INVALID_BODY') {
      return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
    }
    return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
  }
}
