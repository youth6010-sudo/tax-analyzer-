import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { isMasterUser } from '@/lib/masterAccess';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session.user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user: session.user, isMaster: isMasterUser(session.user) });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
