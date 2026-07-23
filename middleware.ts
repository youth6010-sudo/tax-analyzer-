import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from '@/lib/session';
import { getSessionOptionsForEdge } from '@/lib/session';
import {
  assertYouthIdsIpAllowed,
  isYouthIdsPath,
  youthIdsForbiddenHtml,
} from '@/lib/youthIdsAccess';

const PUBLIC_PATHS = ['/login'];
const PUBLIC_API = ['/api/auth/login', '/api/auth/login-users'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (PUBLIC_API.some(p => pathname === p)) return true;
  // Vercel Cron 호출은 세션이 없다. 크론 라우트는 CRON_SECRET(Bearer)으로 자체 인증한다.
  if (pathname.startsWith('/api/cron/')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/\.(ico|png|jpg|jpeg|svg|webp|gif|json|woff2?|css|js|map)$/i.test(pathname)) return true;
  return false;
}

function youthIdsForbiddenResponse(): NextResponse {
  return new NextResponse(youthIdsForbiddenHtml(), {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // API는 각 라우트의 requireUser/CRON_SECRET이 인증 — Edge에서 iron-session 이중 해독 생략
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (!process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'SESSION_SECRET not configured' }, { status: 503 });
  }

  // 쿠키 없으면 복호화 없이 로그인으로 (익명 페이지 요청 비용 절감)
  const cookieName = 'busan_portal_session';
  if (!request.cookies.get(cookieName)?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const response = NextResponse.next();
    const session = await getIronSession<SessionData>(request, response, getSessionOptionsForEdge());

    if (!session.user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (isYouthIdsPath(pathname) && !assertYouthIdsIpAllowed(request.headers)) {
      return youthIdsForbiddenResponse();
    }

    return response;
  } catch {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * 정적 자산·Next 내부 경로는 미들웨어 자체를 건너뛴다.
     * API는 위에서 early-return 하지만 matcher에 포함해도 세션 해독은 하지 않음.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff2?|css|js|map)$).*)',
  ],
};
