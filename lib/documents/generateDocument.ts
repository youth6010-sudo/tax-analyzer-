export type DocumentType = '내용증명' | '해임통보' | '지급명령';

export type GenerateDocumentInput = {
  type: DocumentType;
  [key: string]: unknown;
};

export function generateDocument({ type, ...data }: GenerateDocumentInput): never {
  // TODO: 서식 모듈 연결 예정
  // type: '내용증명' | '해임통보' | '지급명령'
  void type;
  void data;
  throw new Error('not implemented');
}
