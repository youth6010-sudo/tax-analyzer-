import { NextResponse } from 'next/server';

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
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ client, contact: clientRecordToContact(client) });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    await requireUser();
    const { id } = await params;
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
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (e instanceof Error && e.message === 'COMPANY_NAME_REQUIRED') {
      return NextResponse.json({ error: '업체명은 필수입니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const result = await deleteClientById(id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
