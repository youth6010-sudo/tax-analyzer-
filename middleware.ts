import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from '@/lib/session';
import { getSessionOptionsForEdge } from '@/lib/session';

const PUBLIC_PATHS = ['/login'];
const PUBLIC_API = ['/api/auth/login', '/api/auth/login-users'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (PUBLIC_API.some(p => pathname === p)) return true;
  // Vercel Cron 호출은 세션이 없다. 크론 라우트는 CRON_SECRET(Bearer)으로 자체 인증한다.
  if (pathname.startsWith('/api/cron/')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/\.(ico|png|jpg|jpeg|svg|webp|json|woff2?)$/.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  if (!process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'SESSION_SECRET not configured' }, { status: 503 });
  }

  try {
    const response = NextResponse.next();
    const session = await getIronSession<SessionData>(request, response, getSessionOptionsForEdge());

    if (!session.user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Session error' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
