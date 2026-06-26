// 블루홀 서버측 세션 헬퍼 — 담당자(userId)별 자격증명/세션 사용.
//   자격증명: DB(users.bluehole_*) 우선, 없으면 환경변수 폴백 (lib/blueholeAuthDb)
//   세션 쿠키(PHPSESSID)는 DB에 캐시, 45분 TTL, 만료/오류 시 1회 재로그인.
import * as bh from './core.js';
import {
  getUserBlueholeCreds,
  getUserBlueholeSession,
  setUserBlueholeSession,
  clearUserBlueholeSession,
  isBlueholeConfiguredForUser,
} from '../blueholeAuthDb';
import { getBlueholeRelay } from '../appConfigDb';

const TTL_MS = 45 * 60 * 1000; // 45분

export async function blueholeConfiguredForUser(userId: string): Promise<boolean> {
  return isBlueholeConfiguredForUser(userId);
}

// 호출 직전에 중계기 설정을 반영한다.
//   BLUEHOLE_USE_RELAY=1 (Vercel 등 IP 비허용 환경): DB에 등록된 사무실 중계기를 경유.
//   미설정(사무실 자체호스팅): 블루홀에 직접 접속(사무실 IP).
async function applyRelay(): Promise<void> {
  if (process.env.BLUEHOLE_USE_RELAY === '1') {
    const relay = await getBlueholeRelay();
    if (!relay) {
      throw new Error(
        '블루홀 중계기(사무실 PC)가 연결되어 있지 않습니다. 사무실 중계기(npm run relay:bluehole)를 켜주세요.',
      );
    }
    bh.configureBlueholeRelay({ baseUrl: relay.url, secret: relay.secret });
  } else {
    bh.configureBlueholeRelay({});
  }
}

async function getCookie(userId: string, force = false): Promise<string> {
  await applyRelay();
  if (!force) {
    const sess = await getUserBlueholeSession(userId);
    if (sess && Date.now() - sess.at < TTL_MS) return sess.cookie;
  }
  const creds = await getUserBlueholeCreds(userId);
  if (!creds) {
    throw new Error('블루홀 계정이 등록되어 있지 않습니다. 블루홀 페이지에서 계정을 먼저 등록하세요.');
  }
  const { cookie } = await bh.login(creds);
  await setUserBlueholeSession(userId, cookie);
  return cookie;
}

// 세션 만료/오류 시 1회 재로그인하며 작업을 실행한다.
export async function withBluehole<T>(userId: string, fn: (cookie: string) => Promise<T>): Promise<T> {
  const cookie = await getCookie(userId);
  try {
    return await fn(cookie);
  } catch {
    await clearUserBlueholeSession(userId);
    const fresh = await getCookie(userId, true);
    return await fn(fresh);
  }
}

// 자격증명 등록 시 즉시 검증 (로그인만 시도, 세션은 저장하지 않음)
export async function verifyBlueholeLogin(
  loginId: string,
  password: string,
): Promise<{ ok: true; name: string }> {
  await applyRelay();
  const { user } = await bh.login({ loginId, password });
  const name = (user && (user.name || user.nickname || user.login_id)) || loginId;
  return { ok: true, name };
}
