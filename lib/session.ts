import type { SessionOptions } from 'iron-session';

export interface SessionUser {
  id: string;
  loginId: string;
  name: string;
  role: 'staff' | 'admin';
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
      maxAge: 60 * 60 * 24 * 14,
    },
  };
}

/** Edge middleware용 (password만) */
export function getSessionOptionsForEdge(): SessionOptions {
  return getSessionOptions();
}
