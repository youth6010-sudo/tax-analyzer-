import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { normalizeMenuPrefs } from '@/lib/menuPrefs';
import { getUserMenuPrefs, setUserMenuPrefs } from '@/lib/menuPrefsDb';

export async function GET() {
  try {
    const user = await requireUser();
    const prefs = await getUserMenuPrefs(user.id);
    return NextResponse.json({ prefs });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load menu prefs' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    if (body?.reset === true) {
      const prefs = await setUserMenuPrefs(user.id, {}, { replace: true });
      return NextResponse.json({ prefs });
    }
    const prefs = await setUserMenuPrefs(user.id, normalizeMenuPrefs(body?.prefs ?? body));
    return NextResponse.json({ prefs });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to save menu prefs' }, { status: 500 });
  }
}
