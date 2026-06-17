import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isPortalAdmin } from '@/lib/auth';
import { listClients } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as 'intake' | 'active' | 'churned' | null;
    const mineOnly = searchParams.get('mine') === '1';
    const includeChurned = searchParams.get('includeChurned') === '1';
    const businessEntityType = searchParams.get('entity') ?? undefined;

    const clients = await listClients({
      status: status ?? undefined,
      includeChurned: includeChurned || undefined,
      mineOnly,
      userId: user.id,
      userName: user.name,
      businessEntityType,
      assignedUserId:
        isPortalAdmin(user) && searchParams.get('assignedUserId')
          ? searchParams.get('assignedUserId')!
          : undefined,
    });

    return NextResponse.json({ clients });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
