import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listClients } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as 'intake' | 'active' | 'churned' | null;
    const mineOnly = searchParams.get('mine') === '1';
    const businessEntityType = searchParams.get('entity') ?? undefined;

    const clients = await listClients({
      status: status ?? undefined,
      mineOnly: mineOnly && user.role !== 'admin',
      userId: user.id,
      userName: user.name,
      businessEntityType,
      assignedUserId:
        user.role === 'admin' && searchParams.get('assignedUserId')
          ? searchParams.get('assignedUserId')!
          : undefined,
    });

    return NextResponse.json({ clients });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
