import type { SessionOptions } from 'iron-session';

export interface SessionUser {
  id: string;
  loginId: string;
  name: string;
  role: 'staff' | 'admin';
  /** 리아 등 — 로그인 시 관리자 모드 선택 시 true */
  adminMode?: boolean;
}

export interface SessionData {
  user?: SessionUser;
}

export function getSessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return secret;
}

export function getSessionOptions(): SessionOptions {
  return {
    password: getSessionPassword(),
    cookieName: 'busan_portal_session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    },
  };
}

/** Node proxy.ts용 (기존 Edge middleware 별칭) */
export function getSessionOptionsForEdge(): SessionOptions {
  return getSessionOptions();
}
