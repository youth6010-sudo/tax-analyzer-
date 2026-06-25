import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';

import {
  deleteClientById,
  getClientById,
  getClientFeeChanges,
  updateClient,
  updateClientDetail,
  updateClientFeeSummary,
  updateClientFeeBreakdown,
  type ClientPatch,
} from '@/lib/clientsDb';

import { clientRecordToContact, clientRecordToListRecord } from '@/lib/clientMapper';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);
    return NextResponse.json(
      { client, contact: clientRecordToContact(client!) },
      NO_STORE,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

function isDetailOnlyPatch(body: Partial<ClientPatch>): boolean {
  return body.companyName === undefined && body.intakeData !== undefined;
}

function isFeeSummaryOnlyPatch(body: Record<string, unknown>): body is { feeSummary: number | null } {
  return Object.keys(body).length === 1 && 'feeSummary' in body && (body.feeSummary === null || typeof body.feeSummary === 'number');
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

    if (isFeeBreakdownPatch(body)) {
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
