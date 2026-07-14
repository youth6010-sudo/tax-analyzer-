import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import {
  canUseCharlieFeatures,
  canUseIndieFeatures,
  isDataViewer,
  isDeveloperAdmin,
} from '@/lib/masterAccess';

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
      /** 개발자 전용 메뉴·기능 */
      canUseCharlieFeatures: canUseCharlieFeatures(user),
      /** 검토표 열 구성 등 — 인디·개발자 */
      canUseIndieFeatures: canUseIndieFeatures(user),
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
