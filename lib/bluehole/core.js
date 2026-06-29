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
// 케이스 enum(진행상태/우선순위/의뢰경로)·업무분류(case_types) 맵: GET /meta/env → data.constants 에서 로드한다
//       (블루홀 SPA App.getEnv() 와 동일 소스). caseMaps(cookie) 가 세션별 10분 캐시로 제공.
//       단, start_time/due_time(시간대 코드)은 constants 에 없어 코드값 유지. 거래처 enum 은 STATIC 폴백 정상.

import {
  getCaseInfo as _getCaseInfo,
  listCases as _listCases,
  findCasesBySubject as _findCasesBySubject,
  normalizeCaseInfo,
  htmlToText,
  searchClientList as _searchClientList,
  resolveUserIdByName as _resolveUserIdByName,
  updateCaseViaApi as _updateCaseViaApi,
  createCaseViaApi as _createCaseViaApi,
  parseCaseId,
} from "./case-api.js";
import {
  searchClients as _searchClients,
  listClients as _listClients,
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

// 빈 케이스 맵(폴백): /meta/env 호출 실패 시 코드값으로 동작.
export function emptyCaseMaps() {
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
    private: new Map(),
  };
}

// ── /meta/env (env 상수) ─────────────────────────────────────────────
// 블루홀 SPA의 App.getEnv() 소스. GET /meta/env → data.constants 에
// case_status / case_priority / case_request_routes / case_types(업무분류) 등이 들어있다.
// (라이브 관찰: service.api.env() == GET meta/env)
export async function getMeta(cookie) {
  const ctx = createContext(cookie);
  const res = await ctx.request.get(`${HOST}/meta/env`);
  const json = await res.json().catch(() => null);
  if (!json) throw new Error("meta/env 응답을 해석할 수 없습니다.");
  if (json.isSuccess === false) throw new Error("meta/env 조회 실패(세션 만료?).");
  return json.data || json;
}

function _revMap(arr) {
  const m = new Map();
  for (const it of arr || []) {
    if (it && it.id != null) m.set(String(it.id), it.displayname || String(it.id));
  }
  return m;
}

// env.constants → caseMaps 구조(case-api.js normalize* 가 기대하는 형태)
export function buildCaseMaps(constants) {
  const c = constants || {};
  const statusRev = _revMap(c.case_status);
  const priorityRev = _revMap(c.case_priority);
  const request_routeRev = _revMap(c.case_request_routes);
  const privateRev = _revMap(c.case_private);
  const caseTypes = (c.case_types || []).map((t) => ({
    id: t.id,
    name: t.displayname || String(t.id),
    parent_code: t.parent_code || null,
    idx: t.idx,
  }));
  return {
    status: statusRev,
    priority: priorityRev,
    request_route: request_routeRev,
    // start_time/due_time(시간대 코드)은 constants에 없음 → 코드값 유지
    start_time: new Map(),
    due_time: new Map(),
    statusRev,
    priorityRev,
    request_routeRev,
    start_timeRev: new Map(),
    due_timeRev: new Map(),
    caseTypes,
    private: privateRev,
  };
}

// 세션별 짧은 캐시(org-wide 상수, env_version 으로 갱신성 보장 가능하지만 단순 TTL 사용)
const _caseMapsCache = new Map(); // cookie -> { at, maps }
const CASE_MAPS_TTL_MS = 10 * 60 * 1000;

// 케이스 enum/업무분류 맵: /meta/env 에서 로드(캐시). 실패 시 빈 맵 폴백.
export async function caseMaps(cookie) {
  if (!cookie) return emptyCaseMaps();
  const hit = _caseMapsCache.get(cookie);
  if (hit && Date.now() - hit.at < CASE_MAPS_TTL_MS) return hit.maps;
  try {
    const env = await getMeta(cookie);
    const maps = buildCaseMaps(env.constants);
    _caseMapsCache.set(cookie, { at: Date.now(), maps });
    return maps;
  } catch {
    return emptyCaseMaps();
  }
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

export function listClients(cookie, opts) {
  return _listClients(createContext(cookie), opts || {});
}

// 내 프로필(소속 지점/팀) — myInfo.data.info
export async function getMyProfile(cookie) {
  const ctx = createContext(cookie);
  const res = await ctx.request.get(`${HOST}/user/info?act=myInfo`);
  const json = await res.json().catch(() => null);
  const info = (json && json.data && json.data.info) || (json && json.data) || {};
  return {
    id: info.id != null ? String(info.id) : "",
    name: info.name || "",
    nickname: info.nickname || "",
    branch_id: info.branch_id != null ? String(info.branch_id) : "",
    branch_name: info.branch_name || "",
    team_id: info.team_id != null ? String(info.team_id) : "",
    team_name: info.team_name || "",
  };
}

// 사용자 목록(이름/소속) — 팀원/지점 추출용
export async function listUsers(cookie) {
  const ctx = createContext(cookie);
  const res = await ctx.request.get(
    `${HOST}/user/list?act=getList&is_work_status_normal=t&order=name&orderAsc=asc&without_system_user=t`,
  );
  const json = await res.json().catch(() => null);
  const list = (json && json.data && json.data.list) || (json && json.list) || [];
  return list.map((x) => {
    const u = x.user_obj || x;
    return {
      id: u.id != null ? String(u.id) : "",
      name: u.name || "",
      nickname: u.nickname || "",
      branch_id: u.branch_id != null ? String(u.branch_id) : "",
      branch_name: u.branch_name || "",
      team_id: u.team_id != null ? String(u.team_id) : "",
      team_name: u.team_name || "",
    };
  });
}

// 지점 목록(distinct) — 지점 셀렉터용
export async function listBranches(cookie) {
  const users = await listUsers(cookie);
  const map = new Map();
  for (const u of users) {
    if (u.branch_id && !map.has(u.branch_id)) map.set(u.branch_id, u.branch_name);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function getClientInfo(cookie, id) {
  return _getClientInfo(createContext(cookie), id);
}

export async function getClient(cookie, id) {
  const [raw, maps] = await Promise.all([_getClientInfo(createContext(cookie), id), clientMaps()]);
  return { ...normalizeClientInfo(raw, maps), CLIENT_FIELDS, enumOptions: maps.options };
}

export function getCaseInfo(cookie, id) {
  return _getCaseInfo(createContext(cookie), id);
}

export async function getCase(cookie, id) {
  const [raw, maps] = await Promise.all([_getCaseInfo(createContext(cookie), id), caseMaps(cookie)]);
  const normalized = normalizeCaseInfo(raw, maps);
  const info = (raw && raw.info) || raw || {};
  normalized.codes = {
    subject: info.subject || "",
    client_id: info.client_id != null ? String(info.client_id) : "",
    assigned_by: info.assigned_by != null ? String(info.assigned_by) : "",
    status: info.status != null ? String(info.status) : "",
    priority: info.priority != null ? String(info.priority) : "",
    request_route: info.request_route != null ? String(info.request_route) : "",
    case_type1: info.case_type1 != null ? String(info.case_type1) : "",
    case_type2: info.case_type2 != null ? String(info.case_type2) : "",
    start_date: info.start_date || "",
    due_date: info.due_date || "",
    parent_id: info.parent_id != null ? String(info.parent_id) : "",
  };
  return normalized;
}

export async function listCases(cookie, filters = {}, maps) {
  const useMaps = maps || (await caseMaps(cookie));
  return _listCases(createContext(cookie), filters, useMaps);
}

export function updateCase(cookie, id, changes) {
  return _updateCaseViaApi(createContext(cookie), id, changes);
}

export function createCase(cookie, values) {
  return _createCaseViaApi(createContext(cookie), values);
}

// 케이스 폼 메타(진행상태/우선순위/의뢰경로/업무분류 2단) — /meta/env 기반, 직렬화 가능 형태
export async function getCaseFormMeta(cookie) {
  const env = await getMeta(cookie);
  const c = (env && env.constants) || {};
  const opt = (arr) => (arr || []).map((x) => ({ id: String(x.id), name: x.displayname || String(x.id) }));
  const caseTypes = (c.case_types || []).map((t) => ({
    id: String(t.id),
    name: t.displayname || String(t.id),
    code: t.code != null ? String(t.code) : "",
    parent_code: t.parent_code != null ? String(t.parent_code) : "",
  }));
  return {
    statuses: opt(c.case_status),
    priorities: opt(c.case_priority),
    requestRoutes: opt(c.case_request_routes),
    caseTypes,
  };
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
export { CASE_COLUMNS } from "./case-api.js";
