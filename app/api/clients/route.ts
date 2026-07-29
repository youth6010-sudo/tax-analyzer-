import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isDataViewer } from '@/lib/auth';
import { shouldFilterClientsToMine, type RestrictedClientListScope } from '@/lib/masterAccess';
import { listClients } from '@/lib/clientsDb';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as 'intake' | 'active' | 'churned' | null;
    const scope = searchParams.get('scope') as RestrictedClientListScope | null;
    const mineOnly =
      searchParams.get('mine') === '1' || shouldFilterClientsToMine(user, scope);
    const includeChurned = searchParams.get('includeChurned') === '1';
    const includeIntake = searchParams.get('includeIntake') === '1';
    const businessEntityType = searchParams.get('entity') ?? undefined;

    const clients = await listClients({
      status: status ?? undefined,
      includeChurned: includeChurned || undefined,
      includeIntake: includeIntake || undefined,
      mineOnly,
      userId: user.id,
      userName: user.name,
      businessEntityType,
      assignedUserId:
        isDataViewer(user) && searchParams.get('assignedUserId')
          ? searchParams.get('assignedUserId')!
          : undefined,
    });

    return NextResponse.json(
      { clients },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
