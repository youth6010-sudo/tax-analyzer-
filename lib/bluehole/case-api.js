// 블루홀 케이스를 내부 JSON API로 직접 처리한다.
// (옵시디언 도구 _블루홀업로더/case-api.js 에서 들여온 사본 — context.request 만 사용)
//
//   - 케이스 생성: POST /case/info?act=newCase        (multipart/form-data)
//   - 케이스 수정: POST /case/info/<id>?act=updateCase (multipart/form-data)  (일반 컬럼은 kv[필드명])
//   - 케이스 조회: GET  /case/info/<id>?act=getInfo
//   - 케이스 목록: GET  /case/list?act=getList&q=...
//
// 주의: readFormMaps/buildCasePayload/createCaseViaApi/updateCaseViaApi 는 브라우저 page 가 필요하다.
//       HTTP 전용(코어)에서는 사용하지 않으며, 케이스 enum/업무분류 맵은 별도 소스가 필요하다.

const HOST = "https://bluehole.world";

const SEARCH = {
  client: (q) => `${HOST}/client/list?act=getList&search[name]=${encodeURIComponent(q)}`,
  user: (q) =>
    `${HOST}/user/list?act=getList&is_work_status_normal=t&q=${encodeURIComponent(
      q
    )}&order=name&orderAsc=asc&without_system_user=t`,
  userAll: () =>
    `${HOST}/user/list?act=getList&is_work_status_normal=t&order=name&orderAsc=asc&without_system_user=t`,
  userGroup: () => `${HOST}/user/group?act=getList&with_user_list=t`,
  tag: (q) => `${HOST}/case/tag?act=search&q=${encodeURIComponent(q)}`,
  caseList: (q) => `${HOST}/case/list?act=getList&with_child_case=t&q=${encodeURIComponent(q)}`,
};

async function getJsonData(context, url) {
  const res = await context.request.get(url);
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`응답을 해석할 수 없습니다: ${url}`);
  if (typeof json.isSuccess !== "undefined" && !json.isSuccess) {
    const msg = (json.errorMsg && json.errorMsg[0]) || (json.errorIds && json.errorIds[0]) || "API 오류";
    throw new Error(msg);
  }
  return json.data || {};
}

function listOf(data) {
  return (data && data.list) || [];
}

export function htmlToText(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<\/p>\s*<p>/gi, "\n").replace(/<p>/gi, "").replace(/<\/p>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/gi, "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeCaseInfo(rawData, maps) {
  const data = rawData || {};
  const info = data.info || data || {};
  const codeText = (rev, code) =>
    code != null && rev && rev.has(String(code)) ? rev.get(String(code)) : "";
  const ctName = (id) => {
    if (!id) return "";
    const t = (maps.caseTypes || []).find((x) => String(x.id) === String(id));
    return t ? t.name : "";
  };
  const userNames = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((u) => u && u.name)
      .filter(Boolean)
      .join(", ");
  const tagNames = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((t) => t && t.tag_name)
      .filter(Boolean)
      .join(", ");

  return {
    id: info.id != null ? String(info.id) : "",
    title: info.subject || "",
    body: htmlToText(info.description || ""),
    거래처명: (info.client_obj && info.client_obj.name) || "",
    수행자: (info.assigned_user_obj && info.assigned_user_obj.name) || "",
    협력자: userNames(data.ref_users),
    팔로워: userNames(data.followers),
    업무태그: tagNames(data.tags),
    진행상태: codeText(maps.statusRev, info.status),
    우선순위: codeText(maps.priorityRev, info.priority),
    업무의뢰경로: codeText(maps.request_routeRev, info.request_route),
    업무분류1: ctName(info.case_type1),
    업무분류2: ctName(info.case_type2),
    시작일: info.start_date || "",
    시작시간: codeText(maps.start_timeRev, info.start_time),
    마감일: info.due_date || "",
    마감시간: codeText(maps.due_timeRev, info.due_time),
    상위케이스: (info.parent_case_obj && info.parent_case_obj.subject) || "",
  };
}

// 케이스 단건 조회 (협력자/팔로워/태그/체크리스트 포함)
export async function getCaseInfo(context, caseId) {
  if (!caseId) throw new Error("조회할 케이스 ID가 필요합니다.");
  const params =
    "act=getInfo&with_ref_users=t&with_tags=t&with_followers=t&with_checklists=t&with_spend_time=t";
  return getJsonData(context, `${HOST}/case/info/${caseId}?${params}`);
}

function normalizeCaseRow(c, maps) {
  const rev = (m, v) => (v != null && m && m.has(String(v)) ? m.get(String(v)) : "");
  const ctName = (id) => {
    if (!id) return "";
    const t = (maps.caseTypes || []).find((x) => String(x.id) === String(id));
    return t ? t.name : String(id);
  };
  return {
    id: String(c.id),
    subject: c.subject || "",
    client_id: c.client_id != null ? String(c.client_id) : "",
    client_name: (c.client_obj && c.client_obj.name) || "",
    status_code: c.status != null ? String(c.status) : "",
    status: rev(maps.statusRev, c.status),
    priority_code: c.priority != null ? String(c.priority) : "",
    priority: rev(maps.priorityRev, c.priority),
    case_type1_code: c.case_type1 || "",
    case_type1: ctName(c.case_type1),
    start_date: c.start_date || "",
    due_date: c.due_date || "",
    assigned_id: c.assigned_by != null ? String(c.assigned_by) : "",
    assigned_name: (c.assigned_user_obj && c.assigned_user_obj.name) || "",
    created_at: c.created_at || "",
    parent_id: c.parent_id != null ? String(c.parent_id) : "",
    url: `${HOST}/case/info/${c.id}`,
  };
}

export async function listCases(context, filters = {}, maps = {}) {
  const params = new URLSearchParams({ act: "getList", with_child_case: "t" });
  if (filters.client_id) params.set("client_id", String(filters.client_id));
  if (filters.assigned_by) params.set("assigned_by", String(filters.assigned_by));
  if (filters.created_by) params.set("created_by", String(filters.created_by));
  if (filters.q) params.set("q", String(filters.q));
  const data = await getJsonData(context, `${HOST}/case/list?${params.toString()}`).catch(() => ({}));
  let rows = listOf(data).map((c) => normalizeCaseRow(c, maps));

  if (filters.status_code) rows = rows.filter((r) => r.status_code === String(filters.status_code));
  if (filters.case_type1_code)
    rows = rows.filter((r) => r.case_type1_code === String(filters.case_type1_code));
  if (filters.from) rows = rows.filter((r) => !r.due_date || r.due_date >= filters.from);
  if (filters.to) rows = rows.filter((r) => !r.due_date || r.due_date <= filters.to);

  const limit = Number(filters.limit) || 100;
  return { rows: rows.slice(0, limit), total: rows.length };
}

export async function searchClientList(context, q) {
  if (!q) return [];
  const data = await getJsonData(context, SEARCH.client(q)).catch(() => ({}));
  return listOf(data);
}

// "이름" 또는 "이름/닉네임" → 단일 user id
export async function resolveUserIdByName(context, name) {
  if (!name) return null;
  const term = name.includes("/") ? name.split("/")[0].trim() : String(name).trim();
  const data = await getJsonData(context, SEARCH.user(term)).catch(() => ({}));
  const list = listOf(data).map((it) => it.user_obj || it);
  const match =
    list.find((u) => u && (u.name === name || u.nickname === name)) ||
    list.find((u) => u && (u.name === term || u.nickname === term)) ||
    (list.length === 1 ? list[0] : null);
  return match && match.id != null ? String(match.id) : null;
}

export async function findCasesBySubject(context, subject) {
  if (!subject) return [];
  const data = await getJsonData(context, SEARCH.caseList(subject)).catch(() => ({}));
  return listOf(data)
    .filter((c) => (c.subject || "").trim() === subject.trim())
    .map((c) => ({ id: String(c.id), subject: c.subject }));
}

export function parseCaseId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/case\/info\/(\d+)/);
  return m ? m[1] : null;
}

// 케이스 쓰기 가능 컬럼(화이트리스트). 임의 컬럼 쓰기 차단.
export const CASE_COLUMNS = [
  "subject",
  "client_id",
  "assigned_by",
  "status",
  "priority",
  "request_route",
  "case_type1",
  "case_type2",
  "start_date",
  "start_time",
  "due_date",
  "due_time",
  "description",
  "parent_id",
];

async function postJson(context, url, multipart, failMsg) {
  const res = await context.request.post(url, { multipart, headers: { "X-Requested-With": "XMLHttpRequest" } });
  const json = await res.json().catch(() => null);
  if (!json) {
    const txt = await res.text().catch(() => "");
    throw new Error(`응답 해석 실패 (HTTP ${res.status()}): ${txt.slice(0, 200)}`);
  }
  if (typeof json.isSuccess !== "undefined" && !json.isSuccess) {
    const msg = (json.errorMsg && json.errorMsg[0]) || (json.errorIds && json.errorIds[0]) || failMsg;
    throw new Error(msg);
  }
  return json.data || {};
}

// 케이스 수정: POST /case/info/<id>?act=updateCase (multipart, kv[컬럼]=값). 재수정 가능(복구성).
export async function updateCaseViaApi(context, id, changes) {
  if (!id) throw new Error("수정할 케이스 ID가 필요합니다.");
  const cols = Object.keys(changes || {}).filter((c) => CASE_COLUMNS.includes(c));
  if (!cols.length) return { success_cols: [], warnings: ["변경된 항목이 없습니다."] };
  const multipart = {};
  for (const col of cols) multipart[`kv[${col}]`] = changes[col] == null ? "" : String(changes[col]);
  const d = await postJson(context, `${HOST}/case/info/${id}?act=updateCase`, multipart, "케이스 수정 실패");
  const success = d.success_cols || cols;
  const warnings = [];
  const failed = cols.filter((c) => !success.includes(c));
  if (failed.length) warnings.push(`반영되지 않은 항목: ${failed.join(", ")}`);
  return { success_cols: success, warnings, caseUrl: `${HOST}/case/info/${id}` };
}

// 케이스 생성: POST /case/info?act=newCase (multipart, 평문 컬럼). 영구 생성(삭제 불가) — 확인 필수.
export async function createCaseViaApi(context, values) {
  const v = values || {};
  if (!v.subject || !String(v.subject).trim()) throw new Error("케이스 제목(subject)은 필수입니다.");
  const multipart = {};
  for (const col of CASE_COLUMNS) {
    const val = v[col];
    if (val !== undefined && val !== null && String(val).trim() !== "") multipart[col] = String(val);
  }
  const d = await postJson(context, `${HOST}/case/info?act=newCase`, multipart, "케이스 생성 실패");
  const newId = d.new_id || d.newId || d.id || (d.info && d.info.id);
  return {
    newId: newId != null ? String(newId) : "",
    caseUrl: newId ? `${HOST}/case/info/${newId}` : "",
    payload: multipart,
  };
}
