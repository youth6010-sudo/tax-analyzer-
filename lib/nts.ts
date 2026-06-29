// 국세청 사업자등록 상태조회 / 진위확인 (공공데이터포털 15081808, odcloud)
//   상태조회: POST /status   body { b_no: ["1234567890", ...] }   (1회 100건)
//   진위확인: POST /validate body { businesses: [{ b_no, start_dt, p_nm }] }
// IP 화이트리스트가 없어 Vercel 서버 라우트에서 직접 호출한다.
// 서비스키는 process.env.NTS_SERVICE_KEY (data.go.kr 활용신청 후 발급, Decoding 키 권장).

const BASE = 'https://api.odcloud.kr/api/nts-businessman/v1';
const CHUNK = 100;

export interface NtsStatus {
  /** 하이픈 제거 10자리 사업자등록번호 */
  bNo: string;
  /** 계속사업자 | 휴업자 | 폐업자 | (미등록/조회실패) */
  status: string;
  /** 01(계속) | 02(휴업) | 03(폐업) | '' */
  statusCode: string;
  /** 과세유형 문구 (일반/간이/면세 등) */
  taxType: string;
  /** 폐업일 YYYYMMDD (없으면 '') */
  closedDate: string;
  /** 국세청에 등록된 번호인지 */
  found: boolean;
}

export interface NtsValidateResult {
  bNo: string;
  /** valid === '01' (입력값이 국세청 기록과 일치) */
  valid: boolean;
  validCode: string;
  message: string;
  status?: NtsStatus;
}

export interface NtsValidateInput {
  bNo: string;
  /** 개업일자 YYYYMMDD */
  startDt: string;
  /** 대표자명 */
  representative: string;
}

export function isNtsConfigured(): boolean {
  return !!(process.env.NTS_SERVICE_KEY && process.env.NTS_SERVICE_KEY.trim());
}

function serviceKey(): string {
  const key = (process.env.NTS_SERVICE_KEY || '').trim();
  if (!key) throw new Error('NTS_NOT_CONFIGURED');
  // 이미 퍼센트 인코딩된 키면 그대로, 아니면 인코딩
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

export function digits10(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface RawStatusItem {
  b_no?: string;
  b_stt?: string;
  b_stt_cd?: string;
  tax_type?: string;
  end_dt?: string;
}

function mapStatus(item: RawStatusItem): NtsStatus {
  const bNo = digits10(item.b_no || '');
  const status = (item.b_stt || '').trim();
  return {
    bNo,
    status: status || (item.tax_type || '미등록 사업자'),
    statusCode: (item.b_stt_cd || '').trim(),
    taxType: (item.tax_type || '').trim(),
    closedDate: (item.end_dt || '').trim(),
    found: !!status,
  };
}

async function postJson(path: string, body: unknown): Promise<{ data?: unknown[] }> {
  const res = await fetch(`${BASE}${path}?serviceKey=${serviceKey()}&returnType=JSON`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NTS_API_${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { data?: unknown[] };
}

/** 사업자번호 배열 → { 10자리번호: 상태 } 맵. 100건씩 나눠 호출. */
export async function checkStatus(bNos: string[]): Promise<Map<string, NtsStatus>> {
  const result = new Map<string, NtsStatus>();
  const cleaned = [...new Set(bNos.map(digits10).filter(b => b.length === 10))];
  if (cleaned.length === 0) return result;

  for (const part of chunk(cleaned, CHUNK)) {
    const json = await postJson('/status', { b_no: part });
    for (const raw of (json.data ?? []) as RawStatusItem[]) {
      const s = mapStatus(raw);
      if (s.bNo) result.set(s.bNo, s);
    }
  }
  return result;
}

interface RawValidateItem {
  b_no?: string;
  valid?: string;
  valid_msg?: string;
  status?: RawStatusItem;
}

/** 진위확인 — 사업자번호+개업일자+대표자 일치 여부. { 10자리번호: 결과 } 맵. */
export async function validateBusinesses(
  items: NtsValidateInput[],
): Promise<Map<string, NtsValidateResult>> {
  const result = new Map<string, NtsValidateResult>();
  const businesses = items
    .map(it => ({
      b_no: digits10(it.bNo),
      start_dt: String(it.startDt || '').replace(/\D/g, '').slice(0, 8),
      p_nm: String(it.representative || '').trim(),
    }))
    .filter(b => b.b_no.length === 10);
  if (businesses.length === 0) return result;

  for (const part of chunk(businesses, CHUNK)) {
    const json = await postJson('/validate', { businesses: part });
    for (const raw of (json.data ?? []) as RawValidateItem[]) {
      const bNo = digits10(raw.b_no || '');
      if (!bNo) continue;
      const validCode = (raw.valid || '').trim();
      result.set(bNo, {
        bNo,
        valid: validCode === '01',
        validCode,
        message: (raw.valid_msg || '').trim(),
        status: raw.status ? mapStatus(raw.status) : undefined,
      });
    }
  }
  return result;
}
