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
