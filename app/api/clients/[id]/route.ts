import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient, assertCanEditClient, assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { shouldFilterClientsToMine, type RestrictedClientListScope } from '@/lib/masterAccess';

import {
  deleteClientById,
  getClientById,
  getClientFeeChanges,
  updateClient,
  updateClientDetail,
  updateClientFeeSummary,
  updateClientFeeBreakdown,
  updateClientFeeItems,
  type ClientPatch,
} from '@/lib/clientsDb';

import { clientRecordToContact, clientRecordToListRecord } from '@/lib/clientMapper';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const scope = new URL(request.url).searchParams.get('scope') as RestrictedClientListScope | null;
    const client = await getClientById(id);
    if (shouldFilterClientsToMine(user, scope)) {
      assertCanAccessClient(user, client);
    } else {
      assertClientExists(client);
    }
    return NextResponse.json(
      { client, contact: clientRecordToContact(client!) },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

function isDetailOnlyPatch(body: Partial<ClientPatch> & Record<string, unknown>): boolean {
  if (body.companyName !== undefined || body.intakeData === undefined) return false;
  const keys = Object.keys(body);
  const allowed = new Set(['intakeData', 'feeSummary', 'program', 'businessEntityType']);
  return keys.length > 0 && keys.every(k => allowed.has(k));
}

function isFeeSummaryOnlyPatch(body: Record<string, unknown>): body is { feeSummary: number | null } {
  return Object.keys(body).length === 1 && 'feeSummary' in body && (body.feeSummary === null || typeof body.feeSummary === 'number');
}

function isFeeItemsPatch(body: Record<string, unknown>): body is { feeItems: { itemName: string; supplyAmount: number }[] } {
  if (!('feeItems' in body) || !Array.isArray(body.feeItems)) return false;
  return body.feeItems.every(
    item =>
      item &&
      typeof item === 'object' &&
      typeof (item as { itemName?: unknown }).itemName === 'string' &&
      typeof (item as { supplyAmount?: unknown }).supplyAmount === 'number',
  );
}

function isFeeBreakdownPatch(body: Record<string, unknown>): body is {
  bookkeepingFee: number | null;
  adjustmentFee: number | null;
} {
  return (
    'bookkeepingFee' in body &&
    'adjustmentFee' in body &&
    (body.bookkeepingFee === null || typeof body.bookkeepingFee === 'number') &&
    (body.adjustmentFee === null || typeof body.adjustmentFee === 'number') &&
    Object.keys(body).length === 2
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getClientById(id);
    assertCanAccessClient(user, existing);

    const body = (await request.json()) as Partial<ClientPatch> & Record<string, unknown>;

    if (isFeeItemsPatch(body)) {
      assertCanEditClient(user, existing);
      const feeItems = body.feeItems.map(item => ({
        itemName: item.itemName.trim(),
        supplyAmount: Math.round(item.supplyAmount),
      }));
      const client = clientRecordToListRecord(await updateClientFeeItems(id, feeItems, user.id));
      const feeChanges = await getClientFeeChanges(id);
      return NextResponse.json(
        { client, contact: clientRecordToContact(client), feeChanges },
        NO_STORE,
      );
    }

    if (isFeeBreakdownPatch(body)) {
      assertCanEditClient(user, existing);
      const client = clientRecordToListRecord(
        await updateClientFeeBreakdown(
          id,
          { bookkeepingFee: body.bookkeepingFee, adjustmentFee: body.adjustmentFee },
          user.id,
        ),
      );
      const feeChanges = await getClientFeeChanges(id);
      return NextResponse.json(
        { client, contact: clientRecordToContact(client), feeChanges },
        NO_STORE,
      );
    }

    if (isFeeSummaryOnlyPatch(body)) {
      assertCanEditClient(user, existing);
      const client = clientRecordToListRecord(
        await updateClientFeeSummary(id, body.feeSummary, user.id),
      );
      const feeChanges = await getClientFeeChanges(id);
      return NextResponse.json(
        { client, contact: clientRecordToContact(client), feeChanges },
        NO_STORE,
      );
    }

    const client = isDetailOnlyPatch(body)
      ? await updateClientDetail(id, {
          intakeData: body.intakeData!,
          feeSummary: body.feeSummary,
          program: body.program,
          businessEntityType:
            typeof body.businessEntityType === 'string' ? body.businessEntityType : undefined,
        })
      : await updateClient(id, body as ClientPatch);

    return NextResponse.json(
      { client, contact: clientRecordToContact(client) },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getClientById(id);
    assertCanAccessClient(user, existing);
    const result = await deleteClientById(id);
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
