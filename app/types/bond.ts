/** 채권관리 — 첨부파일 (내용증명·지급명령 공용, 해임통보도 추후 사용) */
export type BondAttachment = {
  id: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
  /** 파일 형식 (뷰어 분기용) */
  mimeType: string;
  /** manual=직접 업로드, generated=서식 자동생성 */
  source: 'manual' | 'generated';
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
};

export type BondCheckedStepKey = '내용증명' | '지급명령';
export type BondAttachmentStepKey = BondCheckedStepKey | '해임통보';

/** DB 저장분 — 담당자명·업체명은 미수관리에서, 첨부는 아직 로컬 state(목업) */
export type BondStoredRecord = {
  내용증명?: { checked: boolean; date: string };
  회수일정?: string;
  해임통보?: { date: string };
  지급명령?: { checked: boolean; date: string };
};

export type BondRecordPatch = Partial<BondStoredRecord>;

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
