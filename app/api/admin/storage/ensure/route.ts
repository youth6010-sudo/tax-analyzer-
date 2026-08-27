import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { isMasterUser } from '@/lib/masterAccess';
import { ensureMailReceiptsBucket, isMailStorageEnabled } from '@/lib/supabaseStorage';
import { getInfraStatus, probeDatabaseReady } from '@/lib/infraStatus';
import { handleApiError } from '@/lib/apiError';

export const runtime = 'nodejs';

/** Storage 버킷 준비 — 마스터/미수관리자 */
export async function POST() {
  try {
    const user = await requireUser();
    if (!isMasterUser(user) && !canManageArrears(user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }
    const result = await ensureMailReceiptsBucket();
    const infra = getInfraStatus();
    return NextResponse.json({
      ...result,
      storageConfigured: isMailStorageEnabled(),
      infra: { ...infra, databaseReady: await probeDatabaseReady() },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function GET() {
  try {
    await requireUser();
    const infra = getInfraStatus();
    return NextResponse.json({
      storageConfigured: isMailStorageEnabled(),
      infra: { ...infra, databaseReady: await probeDatabaseReady() },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
