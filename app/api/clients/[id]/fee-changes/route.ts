import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/apiError';
import { assertClientExists } from '@/lib/clientAccess';
import { requireUser } from '@/lib/auth';
import { getClientById, getClientFeeChanges } from '@/lib/clientsDb';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await getClientById(id);
    assertClientExists(client); // 조회는 전체 허용

    const changes = await getClientFeeChanges(id);
    return NextResponse.json({ changes });
  } catch (e) {
    return handleApiError(e);
  }
}
