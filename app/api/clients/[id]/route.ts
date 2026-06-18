import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';

import {
  deleteClientById,
  getClientById,
  updateClient,
  updateClientColbert,
  updateClientDetail,
  updateClientFeeSummary,
  type ClientPatch,
} from '@/lib/clientsDb';

import { clientRecordToContact } from '@/lib/clientMapper';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);
    return NextResponse.json({ client, contact: clientRecordToContact(client!) });
  } catch (e) {
    return handleApiError(e);
  }
}

function isDetailOnlyPatch(body: Partial<ClientPatch>): boolean {
  return body.companyName === undefined && body.intakeData !== undefined;
}

function isColbertOnlyPatch(body: Record<string, unknown>): body is { colbert: boolean } {
  return typeof body.colbert === 'boolean' && Object.keys(body).length === 1;
}

function isFeeSummaryOnlyPatch(body: Record<string, unknown>): body is { feeSummary: number | null } {
  return Object.keys(body).length === 1 && 'feeSummary' in body && (body.feeSummary === null || typeof body.feeSummary === 'number');
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getClientById(id);
    assertCanAccessClient(user, existing);

    const body = (await request.json()) as Partial<ClientPatch> & Record<string, unknown>;

    if (isColbertOnlyPatch(body)) {
      const client = await updateClientColbert(id, body.colbert);
      return NextResponse.json({ client, contact: clientRecordToContact(client) });
    }

    if (isFeeSummaryOnlyPatch(body)) {
      const client = await updateClientFeeSummary(id, body.feeSummary);
      return NextResponse.json({ client, contact: clientRecordToContact(client) });
    }

    const client = isDetailOnlyPatch(body)
      ? await updateClientDetail(id, {
          intakeData: body.intakeData!,
          feeSummary: body.feeSummary,
          program: body.program,
        })
      : await updateClient(id, body as ClientPatch);

    return NextResponse.json({ client, contact: clientRecordToContact(client) });
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
