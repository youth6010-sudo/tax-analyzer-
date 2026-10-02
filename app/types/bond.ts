/** 채권관리 — 첨부파일 (내용증명·지급명령 공용, 해임통보도 추후 사용) */
export type BondAttachment = {
  id: string;
  filename: string;
  /** Supabase Storage(bond-docs) 경로 — 보기 URL은 서명해서 받음 */
  storagePath: string;
  size: number;
  uploadedAt: string;
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
  회수일정: string;
  해임통보: BondDateStep;
  지급명령: BondCheckedStep;
  recipient?: BondRecipient;
};

export type BondCheckedStepKey = '내용증명' | '지급명령';
export type BondAttachmentStepKey = BondCheckedStepKey | '해임통보';

export const BOND_ATTACHMENT_STEPS: BondAttachmentStepKey[] = ['내용증명', '해임통보', '지급명령'];

export type BondAttachmentMap = Partial<Record<BondAttachmentStepKey, BondAttachment[]>>;

export type BondNoticeVersion = 'v1' | 'v1.5' | 'v2';

/** 해임통보 안내문 발송 기록 — v1.5는 직전 v1 기한을 인용 */
export type BondNotice = {
  version: BondNoticeVersion;
  docNo: string;
  sentDate: string;
  /** 입금 기한 YYYY-MM-DD (v1.5는 비움) */
  deadline: string;
};

/** 안내문 하단 담당 줄 기본값 */
export type BondContact = {
  담당: string;
  전화: string;
  이메일: string;
};

export const DEFAULT_BOND_CONTACT: BondContact = {
  담당: 'TAX팀 김평진 팀장',
  전화: '051-783-6007',
  이메일: 'youth6@taxbiz.kr',
};

/** DB 저장분 — 담당자명·업체명은 미수관리에서 */
export type BondStoredRecord = {
  내용증명?: { checked: boolean; date: string };
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
    회수일정: '',
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
