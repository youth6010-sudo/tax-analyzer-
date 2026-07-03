import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiError';
import { requireUser } from '@/lib/auth';
import { findClientsByBusinessNo } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const bizNo = request.nextUrl.searchParams.get('bizNo') ?? '';
    const corporateNo = request.nextUrl.searchParams.get('corporateNo') ?? '';
    const residentNo = request.nextUrl.searchParams.get('residentNo') ?? '';
    const businessEntityType = request.nextUrl.searchParams.get('entity') ?? '';
    const category = request.nextUrl.searchParams.get('category') ?? '';
    const clients = await findClientsByBusinessNo(bizNo, {
      corporateNo,
      residentNo,
      businessEntityType,
      category,
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return handleApiError(e);
  }
}
