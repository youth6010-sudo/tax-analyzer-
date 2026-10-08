import { getManagerMatchNames } from '@/app/utils/managerMatch';

/** 채권관리 — 첨부파일 (내용증명·지급명령 공용, 해임통보도 추후 사용) */
export type BondAttachment = {
  id: string;
  filename: string;
  /** Supabase Storage(bond-docs) 경로 — 보기 URL은 서명해서 받음 */
  storagePath: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
  /** 발송일 YYYY-MM-DD — 폴더 모달에서 「○월 ○일 발송 서류」로 묶음 */
  sentDate: string;
  /** 파일 형식 (뷰어 분기용) */
  mimeType: string;
  /** manual=직접 업로드, generated=서식 자동생성, imported=기존 발송본 일괄등록 */
  source: 'manual' | 'generated' | 'imported';
};

/** 내용증명 수신 정보 — 수신 블록·라벨지 기준 */
export type BondRecipient = {
  /** 「○○ 대표님 귀하」의 상호 표기 */
  상호: string;
  구분: '법인' | '개인' | '';
  /** 법인등록번호(법인) / 사업자등록번호(개인) */
  등록번호: string;
  사업장주소: string;
  실제주소: string;
};

/** 체크 → 오늘 날짜, 해제 → 날짜 삭제 */
export type BondCheckedStep = {
  checked: boolean;
  date: string;
  /** 배달증명만 — 우편물 반송 */
  returned?: boolean;
  attachments: BondAttachment[];
};

export type BondDateStep = {
  date: string;
  attachments?: BondAttachment[];
  notices?: BondNotice[];
};

export type BondRecord = {
  /** 미수관리 항목 id */
  id: string;
  담당자명: string;
  업체명: string;
  내용증명: BondCheckedStep;
  /** 우체국 배달증명 — 내용증명 수령 확인 */
  배달증명: BondCheckedStep;
  회수일정: string;
  /** 회수일정 관련 받은 서류 (분할변제 합의서 등) */
  회수일정첨부: BondAttachment[];
  해임통보: BondDateStep;
  지급명령: BondCheckedStep;
  recipient?: BondRecipient;
};

export type BondCheckedStepKey = '내용증명' | '배달증명' | '지급명령';
export type BondAttachmentStepKey = BondCheckedStepKey | '해임통보' | '회수일정';

/** 순서 = 저장 경로의 단계 번호 — 새 단계는 맨 뒤에만 추가 */
export const BOND_ATTACHMENT_STEPS: BondAttachmentStepKey[] = ['내용증명', '해임통보', '지급명령', '회수일정', '배달증명'];

export type BondAttachmentMap = Partial<Record<BondAttachmentStepKey, BondAttachment[]>>;

/** 유예·기장 = 현행 안내문 / v1·v1.5·v2 = 이전 양식 발송 기록 */
export type BondNoticeVersion = '유예' | '기장' | 'v1' | 'v1.5' | 'v2';
export const BOND_NOTICE_VERSIONS: BondNoticeVersion[] = ['유예', '기장', 'v1', 'v1.5', 'v2'];

/** 해임 구분 이름 → 해임통보 공문 종류 (유예·기장만 공문 생성) */
export function dismissalNoticeKind(churnLabel: string): '유예' | '기장' | null {
  const l = churnLabel.replace(/\s+/g, '');
  if (l === '유예') return '유예';
  if (l === '기장') return '기장';
  return null;
}

/** 지급명령까지 진행하는 해임 구분 */
export function paymentOrderAllowed(churnLabel: string): boolean {
  const l = churnLabel.replace(/\s+/g, '');
  return l === '기장' || l === '해임';
}

/** 해임통보 안내문 발송 기록 — v1.5는 직전 v1 기한을 인용 */
export type BondNotice = {
  version: BondNoticeVersion;
  docNo: string;
  sentDate: string;
  /** 입금 기한 YYYY-MM-DD (v1.5는 비움) */
  deadline: string;
  /** 안내문에 넣은 담당 — 다음 생성 때 선택 목록으로 사용 */
  contact?: BondContact;
  /** 수정 시 다시 불러올 본문 값 */
  recipientName?: string;
  period?: string;
  amount?: number;
  modifiedAt?: string;
  modifiedBy?: string;
  /** 마지막 수정 사유 */
  modifyReason?: string;
};

/** 문서번호가 붙은 해임통보 서식생성 파일은 삭제 불가 */
export function isLockedBondAttachment(step: BondAttachmentStepKey, att: BondAttachment): boolean {
  return step === '해임통보' && att.source === 'generated';
}

/** 이력관리에서 「수정」으로 다시 여는 안내문 */
export type BondNoticeEdit = {
  entryId: string;
  docNo: string;
  version: BondNoticeVersion;
  sentDate: string;
  deadline: string;
  contact?: BondContact;
  recipientName?: string;
  period?: string;
  amount?: number;
};

/** 채권관리 단계별 변경 이력 (날짜·체크·메모·첨부·발송 기록) */
export type BondChangeLogEntry = {
  at: string;
  by: string;
  entryId: string;
  step: BondAttachmentStepKey;
  action: string;
  detail: string;
};

/** 해임통보 문서번호 발급 대장 — PDF를 만들 때마다 한 줄 (폴더 저장 여부와 무관) */
export type BondDocLogEntry = {
  docNo: string;
  entryId: string;
  companyName: string;
  version: BondNoticeVersion;
  sentDate: string;
  deadline: string;
  contact?: BondContact;
  recipientName?: string;
  period?: string;
  amount?: number;
  /** true = 폴더 저장 + 발송 기록, false = PDF만 */
  saved: boolean;
  issuedAt: string;
  issuedBy: string;
  modifiedAt?: string;
  modifiedBy?: string;
  /** 마지막 수정 사유 */
  modifyReason?: string;
};

/** 안내문 하단 담당 줄 기본값 */
export type BondContact = {
  담당: string;
  전화: string;
  이메일: string;
};

const OFFICE_TEL = '051-783-6007';

/** 해임통보 담당 선택 목록 */
export const BOND_STAFF_CONTACTS: BondContact[] = [
  { 담당: 'TAX팀 김평진 팀장', 전화: OFFICE_TEL, 이메일: 'youth6@taxbiz.kr' },
  { 담당: 'TAX팀 안혜빈 과장', 전화: OFFICE_TEL, 이메일: 'youth4@taxbiz.kr' },
  { 담당: 'TAX팀 박혜림 과장', 전화: OFFICE_TEL, 이메일: 'youth3@taxbiz.kr' },
  { 담당: 'TAX팀 구진혜 과장', 전화: OFFICE_TEL, 이메일: 'youth2@taxbiz.kr' },
  { 담당: 'TAX팀 이희만 주임', 전화: OFFICE_TEL, 이메일: 'youth7@taxbiz.kr' },
  { 담당: '신상협 세무사', 전화: OFFICE_TEL, 이메일: 'youth@taxbiz.kr' },
];

export const DEFAULT_BOND_CONTACT: BondContact = BOND_STAFF_CONTACTS[0]!;

/** 이 담당(찰리·다야) 업체의 안내문에는 리아 연락처를 넣음 */
const CONTACT_ALIAS: Record<string, string> = { 이희만: '박혜림', 홍다예: '박혜림' };

/** 미수관리 담당자명(닉네임·실명) → 안내문 담당 줄 (목록에 없으면 null) */
export function bondContactForManager(managerName: string): BondContact | null {
  const names = getManagerMatchNames(managerName.trim()).map(n => n.replace(/\s+/g, ''));
  if (!names.length) return null;
  const alias = names.map(n => CONTACT_ALIAS[n]).find(Boolean);
  const targets = alias ? [alias] : names;
  return (
    BOND_STAFF_CONTACTS.find(c => {
      const name = c.담당.split(/\s+/).find(w => w.length === 3 && !w.includes('팀')) ?? '';
      return !!name && targets.some(t => t.includes(name));
    }) ?? null
  );
}

/** 해임통보 발신일자·입금기한 일괄값 (빈 문자열 = 미지정) */
export type BondNoticeDefaults = {
  sentDate: string;
  deadline: string;
  savedBy?: string;
  /** ISO 시각 */
  savedAt?: string;
};

/** 일괄 날짜 저장 이력 1건 */
export type BondNoticeDefaultsLogEntry = {
  sentDate: string;
  deadline: string;
  savedBy: string;
  /** ISO 시각 */
  savedAt: string;
};

/** DB 저장분 — 담당자명·업체명은 미수관리에서 */
export type BondStoredRecord = {
  내용증명?: { checked: boolean; date: string };
  /** date = 최종 배달완료일(반송이면 반송일) */
  배달증명?: { checked: boolean; date: string; returned?: boolean };
  회수일정?: string;
  해임통보?: { date: string; notices?: BondNotice[] };
  지급명령?: { checked: boolean; date: string };
  attachments?: BondAttachmentMap;
  recipient?: BondRecipient;
};

/** 첨부는 전용 API로만 변경 */
export type BondRecordPatch = Partial<Omit<BondStoredRecord, 'attachments'>>;

export function emptyBondRecord(id: string, 담당자명: string, 업체명: string): BondRecord {
  return {
    id,
    담당자명,
    업체명,
    내용증명: { checked: false, date: '', attachments: [] },
    배달증명: { checked: false, date: '', attachments: [] },
    회수일정: '',
    회수일정첨부: [],
    해임통보: { date: '', attachments: [] },
    지급명령: { checked: false, date: '', attachments: [] },
  };
}

export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 2026-09-29 → 2026년 9월 29일 */
export function formatSentDateKo(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso || '발송일 미지정';
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}
