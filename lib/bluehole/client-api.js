// 블루홀 "거래처(client)" 도메인을 내부 JSON API로 직접 조회/수정/추가한다.
// (옵시디언 도구 _블루홀업로더/client-api.js 에서 들여온 사본 — context.request 만 사용해 브라우저 비의존)
//
//   - 거래처 검색 : GET  /client/list?act=getList&search[name]=...        (item.id, name, business_number ...)
//   - 거래처 조회 : GET  /client/info/<id>?act=getInfo                     → { info }
//   - 거래처 수정 : GET  /client/info/<id>?act=updateInfo&kv[컬럼]=값      (kv[...] 네임스페이스만 반영됨!)
//   - 거래처 추가 : POST /client/create?act=create  (multipart/form-data)
//
// 주의: 거래처는 삭제 API가 없으므로, "추가"는 실데이터를 영구 생성한다(확인 모달 필수).

const HOST = "https://bluehole.world";

export const CLIENT_FIELDS = [
  { col: "name", label: "거래처명", type: "text", group: "기본", required: true },
  { col: "aka", label: "별칭", type: "text", group: "기본" },
  { col: "business_number", label: "사업자번호", type: "text", group: "기본" },
  { col: "corp_no", label: "법인번호", type: "text", group: "기본" },
  { col: "corp_type", label: "기업구분", type: "enum", enumKey: "corp_type", group: "기본" },
  { col: "tax_type", label: "과세유형", type: "enum", enumKey: "tax_type", group: "기본" },
  { col: "service_type", label: "서비스유형", type: "enum", enumKey: "service_type", group: "서비스" },
  { col: "service_status", label: "서비스상태", type: "enum", enumKey: "service_status", group: "서비스" },
  { col: "money_fee", label: "기장료", type: "text", group: "서비스" },
  { col: "adjustment_fee", label: "조정료", type: "text", group: "서비스" },
  { col: "manage_program", label: "세무프로그램", type: "text", group: "서비스" },
  { col: "smlove_id", label: "세무사랑코드", type: "text", group: "서비스" },
  { col: "acc_withhold", label: "원천신고유형", type: "enum", enumKey: "acc_withhold", group: "원천/급여" },
  { col: "is_labor_cost", label: "인건비여부", type: "enum", enumKey: "is_labor_cost", group: "원천/급여" },
  { col: "pay_month_type", label: "지급월", type: "enum", enumKey: "pay_month_type", group: "원천/급여" },
  { col: "pay_day", label: "급여일", type: "text", group: "원천/급여" },
  { col: "ceo_name", label: "대표자 이름", type: "text", group: "대표자" },
  { col: "ceo_ssn", label: "대표자 주민번호", type: "text", group: "대표자" },
  { col: "ceo_phone", label: "대표자 연락처", type: "text", group: "대표자" },
  { col: "acc_email", label: "대표 이메일", type: "text", group: "대표자" },
  { col: "acc_fax", label: "대표 팩스", type: "text", group: "대표자" },
  { col: "acc_business_category", label: "업태", type: "text", group: "사업장" },
  { col: "acc_business_sector", label: "업종", type: "text", group: "사업장" },
  { col: "industry_code", label: "업종코드", type: "text", group: "사업장" },
  { col: "acc_address", label: "주소", type: "text", group: "사업장" },
  { col: "zip_code", label: "우편번호", type: "text", group: "사업장" },
  { col: "area", label: "지역", type: "text", group: "사업장" },
  { col: "charge_name", label: "실무자", type: "text", group: "담당/연락" },
  { col: "charge_phone", label: "실무자 연락처", type: "text", group: "담당/연락" },
  { col: "inflow_channel", label: "유입채널", type: "enum", enumKey: "inflow_channel", group: "담당/연락" },
  { col: "opening_date", label: "개업일", type: "date", group: "일자" },
  { col: "closing_date", label: "폐업일", type: "date", group: "일자" },
  { col: "contract_date", label: "계약일", type: "date", group: "일자" },
  { col: "termiation_date", label: "종료일", type: "date", group: "일자" },
  { col: "termiation_reason", label: "종료사유", type: "text", group: "일자" },
];

const ENUM_KEYS = [
  "corp_type",
  "tax_type",
  "service_type",
  "service_status",
  "acc_withhold",
  "is_labor_cost",
  "pay_month_type",
  "inflow_channel",
];

const STATIC_ENUMS = {
  corp_type: [
    { value: "1", text: "개인" },
    { value: "2", text: "법인" },
    { value: "3", text: "비사업자" },
  ],
  tax_type: [
    { value: "1", text: "일반과세" },
    { value: "2", text: "간이과세" },
    { value: "3", text: "간이(세금)" },
    { value: "4", text: "면세" },
    { value: "5", text: "비영리" },
  ],
  service_type: [
    { value: "1", text: "기장" },
    { value: "2", text: "신고" },
    { value: "3", text: "용역" },
  ],
  service_status: [
    { value: "1", text: "계속" },
    { value: "2", text: "폐업" },
    { value: "3", text: "이전" },
    { value: "4", text: "해지" },
    { value: "5", text: "기타" },
    { value: "6", text: "가망고객" },
  ],
  acc_withhold: [
    { value: "1", text: "매월" },
    { value: "2", text: "반기" },
  ],
  is_labor_cost: [
    { value: "1", text: "Y" },
    { value: "2", text: "N" },
  ],
  pay_month_type: [
    { value: "1", text: "당월" },
    { value: "2", text: "차월" },
  ],
  inflow_channel: [
    { value: "DIR", text: "직접유입" },
    { value: "REF", text: "추천" },
    { value: "SOC", text: "소셜 미디어" },
    { value: "SEA", text: "검색 엔진" },
    { value: "ADV", text: "광고" },
    { value: "EVE", text: "이벤트/세미나" },
    { value: "OTH", text: "기타" },
  ],
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

// 작성 폼/임의 페이지에서 거래처 enum 옵션을 읽는다 (App 전역 상수). page 없으면 STATIC 폴백.
export async function readClientMaps(page) {
  let raw = {};
  try {
    raw = await page.evaluate((keys) => {
      const c = (window.App && App.getEnv && App.getEnv().constants) || {};
      const r = {};
      for (const k of keys) r[k] = (c[k] || []).map((o) => ({ value: String(o.id), text: o.displayname }));
      return r;
    }, ENUM_KEYS);
  } catch {
    raw = {};
  }

  const options = {};
  const rev = {};
  const fwd = {};
  for (const k of ENUM_KEYS) {
    const fromPage = raw[k] || [];
    const arr = fromPage.length ? fromPage : STATIC_ENUMS[k] || [];
    options[k] = arr;
    const rm = new Map();
    const fm = new Map();
    for (const o of arr) {
      rm.set(String(o.value), o.text);
      fm.set(o.text, String(o.value));
    }
    rev[k] = rm;
    fwd[k] = fm;
  }
  return { options, rev, fwd };
}

function normalizeClientRow(c) {
  return {
    id: c.id != null ? String(c.id) : "",
    name: c.name,
    aka: c.aka || "",
    business_number: c.business_number || "",
    branch_id: c.branch_id != null ? String(c.branch_id) : "",
    branch_name: (c.branch_obj && c.branch_obj.name) || c.branch_name || "",
    manager_name: (c.manager_user_obj && c.manager_user_obj.name) || "",
    manager_user_id: c.manager_user_id != null ? String(c.manager_user_id) : "",
    tax_type: c.tax_type != null ? String(c.tax_type) : "",
    service_status: c.service_status != null ? String(c.service_status) : "",
  };
}

export async function searchClients(context, q) {
  if (!q) return [];
  const data = await getJsonData(context, `${HOST}/client/list?act=getList&search[name]=${encodeURIComponent(q)}`).catch(
    () => ({})
  );
  return listOf(data).filter((c) => c && c.name).map(normalizeClientRow);
}

// 목록 조회: 지점(branch) 한정은 블루홀이 로그인 계정 권한 기준으로 기본 적용.
// branchId 지정 시 해당 지점, q 지정 시 이름검색. limit 으로 페이지 크기 제어(page/offset 미지원).
export async function listClients(context, { q = "", branchId = "", limit = 1000 } = {}) {
  const params = new URLSearchParams({ act: "getList" });
  if (q) params.set("search[name]", String(q));
  if (branchId) params.set("search[branch_id]", String(branchId));
  if (limit) params.set("limit", String(limit));
  const data = await getJsonData(context, `${HOST}/client/list?${params.toString()}`).catch(() => ({}));
  return listOf(data).filter((c) => c && c.name).map(normalizeClientRow);
}

export async function getClientInfo(context, id) {
  if (!id) throw new Error("조회할 거래처 ID가 필요합니다.");
  return getJsonData(context, `${HOST}/client/info/${id}?act=getInfo`);
}

export function normalizeClientInfo(rawData, maps) {
  const data = rawData || {};
  const info = data.info || data || {};
  const values = {};
  const labels = {};
  for (const f of CLIENT_FIELDS) {
    const v = info[f.col];
    values[f.col] = v == null ? "" : String(v);
    if (f.type === "enum" && maps && maps.rev && maps.rev[f.enumKey]) {
      labels[f.col] = maps.rev[f.enumKey].get(String(v)) || "";
    }
  }
  return {
    id: info.id != null ? String(info.id) : "",
    name: info.name || "",
    business_number: info.business_number || "",
    manager: (info.manager_user_obj && info.manager_user_obj.name) || "",
    branch: (info.branch_obj && info.branch_obj.name) || "",
    updated_at: info.updated_at || "",
    values,
    labels,
  };
}

// 거래처 수정: 변경된 컬럼만 kv[col]=값 으로 GET 호출.
export async function updateClientViaApi(context, id, changes) {
  if (!id) throw new Error("수정할 거래처 ID가 필요합니다.");
  const cols = Object.keys(changes || {});
  if (!cols.length) return { success_cols: [], warnings: ["변경된 항목이 없습니다."] };
  const params = new URLSearchParams();
  params.set("act", "updateInfo");
  for (const col of cols) params.set(`kv[${col}]`, changes[col] == null ? "" : String(changes[col]));
  const data = await getJsonData(context, `${HOST}/client/info/${id}?act=updateInfo&${params.toString()}`);
  const success = (data && data.success_cols) || [];
  const warnings = [];
  const failed = cols.filter((c) => !success.includes(c));
  if (failed.length) warnings.push(`반영되지 않은 항목: ${failed.join(", ")}`);
  return { success_cols: success, warnings, clientUrl: `${HOST}/client/info/${id}` };
}

// 거래처 추가 (multipart). 삭제 API가 없으므로 호출 전 확인 필수.
export async function createClientViaApi(context, values) {
  const fd = {};
  for (const f of CLIENT_FIELDS) {
    const v = values[f.col];
    if (v !== undefined && v !== null && String(v).trim() !== "") fd[f.col] = String(v);
  }
  if (values.branch_id) fd.branch_id = String(values.branch_id);
  if (values.manager_user_id) fd.manager_user_id = String(values.manager_user_id);
  if (!fd.name) throw new Error("거래처명(name)은 필수입니다.");

  const multipart = {};
  for (const [k, v] of Object.entries(fd)) multipart[k] = String(v);
  const res = await context.request.post(`${HOST}/client/create?act=create`, {
    multipart,
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  const json = await res.json().catch(() => null);
  if (!json) {
    const txt = await res.text().catch(() => "");
    throw new Error(`응답 해석 실패 (HTTP ${res.status()}): ${txt.slice(0, 200)}`);
  }
  if (typeof json.isSuccess !== "undefined" && !json.isSuccess) {
    const msg = (json.errorMsg && json.errorMsg[0]) || (json.errorIds && json.errorIds[0]) || "거래처 생성 실패";
    throw new Error(msg);
  }
  const d = json.data || {};
  const newId = d.new_id || d.newId || d.id || (d.info && d.info.id);
  return { newId: newId != null ? String(newId) : "", clientUrl: newId ? `${HOST}/client/info/${newId}` : "", payload: fd };
}

export function parseClientId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/client\/info\/(\d+)/);
  return m ? m[1] : null;
}
