import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { isDataViewer, isDeveloperAdmin } from '@/lib/masterAccess';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session.user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    const user = session.user;
    return NextResponse.json({
      user,
      isMaster: isDataViewer(user),
      isDeveloper: isDeveloperAdmin(user),
      adminMode: !!user.adminMode,
      canToggleAdminMode: user.loginId?.trim().toLowerCase() === 'ria',
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
