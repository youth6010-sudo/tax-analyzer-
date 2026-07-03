/** 유입 문의 ↔ 프로세스 상담 ID·excel_key 연결 판별 */

export type InquiryLinkRef = {
  excelKey?: string;
  extra?: Record<string, unknown>;
};

export type ProcessLinkRef = {
  excelKey?: string;
};

export function inquiryConsultationId(inquiry: InquiryLinkRef): string {
  const fromExtra = typeof inquiry.extra?.consultationId === 'string'
    ? inquiry.extra.consultationId.trim()
    : '';
  if (fromExtra) return fromExtra;
  const m = inquiry.excelKey?.match(/^portal\|\|consult\|\|([^|]+)\|\|inquiry$/);
  return m ? m[1] : '';
}

export function processBelongsToInquiry(inquiry: InquiryLinkRef, process: ProcessLinkRef): boolean {
  if (!process.excelKey) return false;

  if (inquiry.excelKey?.startsWith('from-process||')) {
    const processKey = inquiry.excelKey.slice('from-process||'.length);
    if (process.excelKey === processKey) return true;
  }

  const linkedProcessKey = typeof inquiry.extra?.processExcelKey === 'string'
    ? inquiry.extra.processExcelKey.trim()
    : '';
  if (linkedProcessKey && process.excelKey === linkedProcessKey) return true;

  const consultId = inquiryConsultationId(inquiry);
  if (consultId && process.excelKey === `portal||consult||${consultId}||process`) return true;

  return false;
}
