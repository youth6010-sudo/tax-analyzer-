import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/apiError';
import { assertCanAccessClient } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, getClientFeeChanges } from '@/lib/clientsDb';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertCanAccessClient(user, client);

    const changes = await getClientFeeChanges(id);
    return NextResponse.json({ changes });
  } catch (e) {
    return handleApiError(e);
  }
}
