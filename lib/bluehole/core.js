// 블루홀 "이식형 코어" — 브라우저(Playwright) 없이 순수 HTTP(fetch)로 블루홀에 접속한다.
//
// 로그인(라이브 관찰로 확인):
//   POST https://bluehole.world/login?
//   Content-Type: application/x-www-form-urlencoded
//   body: act=login&login_id=<이메일>&password=<비번>&is_redirect=t&redirect_url=/
//   → Set-Cookie: PHPSESSID=...; domain=.bluehole.world; secure; SameSite=Lax
// 이후 모든 데이터 API는 PHPSESSID 쿠키만 붙이면 되는 순수 HTTP.
//
// 설계: 기존 case-api.js / client-api.js 의 context.request 인터페이스를 흉내내는 fetch 어댑터로 재사용한다.
// 한계: 케이스 enum(진행상태/우선순위/의뢰경로/시간)·업무분류(case_types) 맵은 HTTP 전용 소스 미확인 →
//       현재 케이스 목록/조회는 코드값으로 동작(한글 라벨 비어있을 수 있음). 거래처 enum 은 STATIC 폴백 정상.

import {
  getCaseInfo as _getCaseInfo,
  listCases as _listCases,
  findCasesBySubject as _findCasesBySubject,
  normalizeCaseInfo,
  htmlToText,
  searchClientList as _searchClientList,
  resolveUserIdByName as _resolveUserIdByName,
  parseCaseId,
} from "./case-api.js";
import {
  searchClients as _searchClients,
  getClientInfo as _getClientInfo,
  normalizeClientInfo,
  updateClientViaApi as _updateClientViaApi,
  createClientViaApi as _createClientViaApi,
  readClientMaps,
  parseClientId,
  CLIENT_FIELDS,
} from "./client-api.js";

export const HOST = "https://bluehole.world";

// ── 중계기(relay) 지원 ───────────────────────────────────────────────
// Vercel처럼 IP가 허용 안 된 환경에서는, 사무실 PC의 중계기를 거쳐 블루홀에 접속한다.
// configureBlueholeRelay({ baseUrl, secret }) 로 설정하면,
//   https://bluehole.world/... 요청을 baseUrl/... 로 치환하고 x-relay-secret 헤더를 붙인다.
// 설정이 없으면(=빈 값) 블루홀로 직접 호출한다(사무실 IP에서 동작).
let _relayBase = "";
let _relaySecret = "";
export function configureBlueholeRelay(cfg) {
  _relayBase = (cfg && cfg.baseUrl) ? String(cfg.baseUrl).replace(/\/+$/, "") : "";
  _relaySecret = (cfg && cfg.secret) ? String(cfg.secret) : "";
}
function relayUrl(url) {
  if (_relayBase && typeof url === "string" && url.startsWith(HOST)) {
    return _relayBase + url.slice(HOST.length);
  }
  return url;
}
function relayHeaders(h) {
  return _relaySecret ? { ...(h || {}), "x-relay-secret": _relaySecret } : (h || {});
}

function pickCookie(setCookies, name) {
  for (const sc of setCookies || []) {
    const m = String(sc).match(new RegExp(`(?:^|[;,\\s])${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

function readSetCookies(res) {
  if (typeof res.headers.getSetCookie === "function") return res.headers.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

// 로그인 → { cookie, sessionId, user }
/**
 * @param {{ loginId?: string, password?: string, redirectUrl?: string }} [opts]
 */
export async function login({ loginId, password, redirectUrl = "/" } = {}) {
  if (!loginId || !password) throw new Error("loginId/password 가 필요합니다.");
  const body = new URLSearchParams({
    act: "login",
    login_id: loginId,
    password,
    is_redirect: "t",
    redirect_url: redirectUrl,
  }).toString();

  const res = await fetch(relayUrl(`${HOST}/login?`), {
    method: "POST",
    headers: relayHeaders({
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    }),
    body,
    redirect: "manual",
  });

  // 응답 본문(JSON)을 먼저 읽어 서버의 실제 실패 사유(예: 허용되지 않은 IP)를 노출한다.
  const txt = await res.text().catch(() => "");
  let respJson = null;
  try {
    respJson = JSON.parse(txt);
  } catch {
    /* 비 JSON 응답 */
  }
  const pickMsg = (j) =>
    (j && j.errorMsg && j.errorMsg[0]) ||
    (j && j.errorIds && j.errorIds[0]) ||
    "";

  if (respJson && respJson.isSuccess === false) {
    const msg = pickMsg(respJson) || "사유 미상";
    throw new Error(`블루홀 로그인 실패: ${msg} (HTTP ${res.status})`);
  }

  const sid = pickCookie(readSetCookies(res), "PHPSESSID");
  if (!sid) {
    throw new Error(`로그인 실패: 세션 미발급 (HTTP ${res.status}). ${txt.slice(0, 200)}`);
  }
  const cookie = `PHPSESSID=${sid}`;

  const ctx = createContext(cookie);
  const me = await ctx.request.get(`${HOST}/user/info?act=myInfo`);
  const mj = await me.json().catch(() => null);
  if (!mj || mj.isSuccess === false) {
    const msg = pickMsg(mj);
    throw new Error(
      `로그인 검증 실패${msg ? `: ${msg}` : ": 아이디/비밀번호 또는 접속 IP(허용 IP)를 확인하세요."}`,
    );
  }
  return { cookie, sessionId: sid, user: (mj && mj.data) || null };
}

// 세션 쿠키 → Playwright context.request 호환 어댑터(fetch 기반)
export function createContext(cookie) {
  const baseHeaders = {
    Cookie: cookie,
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/plain, */*",
  };
  const wrap = (res) => ({
    status: () => res.status,
    json: () => res.json(),
    text: () => res.text(),
  });
  return {
    cookie,
    request: {
      async get(url) {
        const res = await fetch(relayUrl(url), { headers: relayHeaders(baseHeaders) });
        return wrap(res);
      },
      async post(url, opts = {}) {
        const form = new FormData();
        for (const [k, v] of Object.entries(opts.multipart || {})) form.append(k, String(v));
        const res = await fetch(relayUrl(url), {
          method: "POST",
          headers: relayHeaders({ ...baseHeaders, ...(opts.headers || {}) }),
          body: form,
        });
        return wrap(res);
      },
    },
  };
}

// 거래처 enum 맵: readClientMaps 를 page 없는 가짜 객체로 호출 → STATIC_ENUMS 폴백 재사용
export async function clientMaps() {
  const fakePage = {
    evaluate: async () => {
      throw new Error("no page (http-only)");
    },
  };
  return readClientMaps(fakePage);
}

// 케이스 enum/업무분류 맵: HTTP 전용 소스 미확인 → 빈 맵(코드값으로 동작)
export function caseMaps() {
  return {
    status: new Map(),
    priority: new Map(),
    request_route: new Map(),
    start_time: new Map(),
    due_time: new Map(),
    statusRev: new Map(),
    priorityRev: new Map(),
    request_routeRev: new Map(),
    start_timeRev: new Map(),
    due_timeRev: new Map(),
    caseTypes: [],
  };
}

export async function getMyInfo(cookie) {
  const ctx = createContext(cookie);
  const res = await ctx.request.get(`${HOST}/user/info?act=myInfo`);
  const json = await res.json().catch(() => null);
  if (!json || json.isSuccess === false) throw new Error("내 정보 조회 실패(세션 만료?).");
  return json.data || {};
}

export function searchClients(cookie, q) {
  return _searchClients(createContext(cookie), q);
}

export function getClientInfo(cookie, id) {
  return _getClientInfo(createContext(cookie), id);
}

export async function getClient(cookie, id) {
  const [raw, maps] = await Promise.all([_getClientInfo(createContext(cookie), id), clientMaps()]);
  return { ...normalizeClientInfo(raw, maps), CLIENT_FIELDS };
}

export function getCaseInfo(cookie, id) {
  return _getCaseInfo(createContext(cookie), id);
}

export async function getCase(cookie, id) {
  const raw = await _getCaseInfo(createContext(cookie), id);
  return normalizeCaseInfo(raw, caseMaps());
}

export function listCases(cookie, filters = {}, maps) {
  return _listCases(createContext(cookie), filters, maps || caseMaps());
}

export function findCasesBySubject(cookie, subject) {
  return _findCasesBySubject(createContext(cookie), subject);
}

export function searchClientList(cookie, q) {
  return _searchClientList(createContext(cookie), q);
}

export function resolveUserIdByName(cookie, name) {
  return _resolveUserIdByName(createContext(cookie), name);
}

export function updateClient(cookie, id, changes) {
  return _updateClientViaApi(createContext(cookie), id, changes);
}

export function createClient(cookie, values) {
  return _createClientViaApi(createContext(cookie), values);
}

export { parseCaseId, parseClientId, normalizeClientInfo, normalizeCaseInfo, htmlToText, CLIENT_FIELDS };
