export type DocumentType = '내용증명' | '해임통보' | '지급명령';

/** 서식생성 버튼 활성 여부 — 내용증명은 채권관리 CertifiedLetterModal 에서 생성 */
const READY: Record<DocumentType, boolean> = {
  내용증명: true,
  해임통보: false,
  지급명령: false,
};

export function isDocumentReady(type: DocumentType): boolean {
  return READY[type];
}

export type GenerateDocumentInput = {
  type: DocumentType;
  [key: string]: unknown;
};

export function generateDocument({ type, ...data }: GenerateDocumentInput): never {
  // TODO: 해임통보·지급명령 서식 모듈 연결 예정
  void type;
  void data;
  throw new Error('not implemented');
}
