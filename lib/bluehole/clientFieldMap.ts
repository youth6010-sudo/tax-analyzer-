// 우리 수임처(ContactRecord) → 블루홀 거래처 컬럼 매핑 (Phase 2 수정 동기화)
// 의미가 명확한 필드만 매핑한다. 전화/휴대번호는 블루홀에서 대표/실무 구분이 모호해 제외.

export interface BlueholeFieldMap {
  /** 우리 수임처 필드 키 (ContactRecord) */
  ours: 'companyName' | 'businessNo' | 'corporateNo' | 'representative' | 'residentNo' | 'fax';
  /** 블루홀 거래처 컬럼 */
  col: string;
  label: string;
  /** 숫자/번호류는 등폭 글꼴 */
  mono?: boolean;
}

export const CLIENT_SYNC_FIELDS: BlueholeFieldMap[] = [
  { ours: 'companyName', col: 'name', label: '거래처명' },
  { ours: 'businessNo', col: 'business_number', label: '사업자번호', mono: true },
  { ours: 'corporateNo', col: 'corp_no', label: '법인번호', mono: true },
  { ours: 'representative', col: 'ceo_name', label: '대표자' },
  { ours: 'residentNo', col: 'ceo_ssn', label: '대표자 주민번호', mono: true },
  { ours: 'fax', col: 'acc_fax', label: '팩스', mono: true },
];

/** 동기화로 블루홀에 쓸 수 있는 컬럼 화이트리스트 (임의 컬럼 쓰기 차단) */
export const SYNCABLE_COLUMNS: ReadonlySet<string> = new Set(CLIENT_SYNC_FIELDS.map((f) => f.col));

export interface ClientCreateSource {
  companyName: string;
  businessNo: string;
  corporateNo: string;
  representative: string;
  residentNo: string;
  fax: string;
  businessEntityType?: string;
}

/** 우리 수임처 → 블루홀 거래처 신규 생성용 값(빈값 제거). 기업구분은 corp_type 코드로 변환. */
export function buildBlueholeCreateValues(src: ClientCreateSource): Record<string, string> {
  const v: Record<string, string> = {
    name: src.companyName || '',
    business_number: src.businessNo || '',
    corp_no: src.corporateNo || '',
    ceo_name: src.representative || '',
    ceo_ssn: src.residentNo || '',
    acc_fax: src.fax || '',
  };
  const corpMap: Record<string, string> = { individual: '1', corporate: '2', nonBusiness: '3' };
  if (src.businessEntityType && corpMap[src.businessEntityType]) v.corp_type = corpMap[src.businessEntityType];
  for (const k of Object.keys(v)) if (!v[k]) delete v[k];
  return v;
}

/** 신규 등록 폼에서 직접 입력/수정 가능한 블루홀 거래처 컬럼 */
export interface BlueholeCreateField {
  col: string;
  label: string;
  type?: 'text' | 'date';
  mono?: boolean;
  group: string;
}

export const BLUEHOLE_CREATE_FIELDS: BlueholeCreateField[] = [
  { col: 'name', label: '거래처명', group: '기본' },
  { col: 'aka', label: '별칭', group: '기본' },
  { col: 'business_number', label: '사업자번호', mono: true, group: '기본' },
  { col: 'corp_no', label: '법인번호', mono: true, group: '기본' },
  { col: 'ceo_name', label: '대표자', group: '대표자' },
  { col: 'ceo_ssn', label: '대표자 주민번호', mono: true, group: '대표자' },
  { col: 'ceo_phone', label: '대표자 연락처', mono: true, group: '대표자' },
  { col: 'acc_email', label: '대표 이메일', group: '대표자' },
  { col: 'acc_fax', label: '팩스', mono: true, group: '대표자' },
  { col: 'charge_name', label: '실무자', group: '담당·연락' },
  { col: 'charge_phone', label: '실무자 연락처', mono: true, group: '담당·연락' },
  { col: 'acc_business_category', label: '업태', group: '사업장' },
  { col: 'acc_business_sector', label: '업종', group: '사업장' },
  { col: 'acc_address', label: '주소', group: '사업장' },
  { col: 'zip_code', label: '우편번호', mono: true, group: '사업장' },
  { col: 'money_fee', label: '기장료', mono: true, group: '서비스' },
  { col: 'adjustment_fee', label: '조정료', mono: true, group: '서비스' },
  { col: 'manage_program', label: '세무프로그램', group: '서비스' },
  { col: 'opening_date', label: '개업일', type: 'date', group: '일자' },
  { col: 'closing_date', label: '폐업일', type: 'date', group: '일자' },
];

/** 신규 등록 시 클라이언트가 덮어쓸 수 있는 컬럼 화이트리스트 */
export const BLUEHOLE_CREATE_COLUMNS: ReadonlySet<string> = new Set(BLUEHOLE_CREATE_FIELDS.map((f) => f.col));

/** 신규 등록 폼 프리필용 확장 소스(수임처 + 부가정보) */
export interface ClientCreatePrefillSource extends ClientCreateSource {
  phone?: string;
  mobilePhone?: string;
  email?: string;
  address?: string;
  zipCode?: string;
  industry?: string;
  item?: string;
  openDate?: string;
  program?: string;
  fee?: string;
}

/** 수임처 정보 → 블루홀 신규 등록 폼 초기값(편집 가능). 빈값도 키는 유지. */
export function buildBlueholeCreatePrefill(src: ClientCreatePrefillSource): Record<string, string> {
  const prefill: Record<string, string> = {
    name: src.companyName || '',
    aka: '',
    business_number: src.businessNo || '',
    corp_no: src.corporateNo || '',
    ceo_name: src.representative || '',
    ceo_ssn: src.residentNo || '',
    ceo_phone: src.mobilePhone || src.phone || '',
    acc_email: src.email || '',
    acc_fax: src.fax || '',
    charge_name: '',
    charge_phone: src.phone || '',
    acc_business_category: src.industry || '',
    acc_business_sector: src.item || '',
    acc_address: src.address || '',
    zip_code: src.zipCode || '',
    money_fee: src.fee || '',
    adjustment_fee: '',
    manage_program: src.program || '',
    opening_date: src.openDate || '',
    closing_date: '',
  };
  return prefill;
}
